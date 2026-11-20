import { getRedis, type RedisClient } from "./client";
import { KEYS, VERDICTS, FORWARDED, type Mode, type Verdict } from "./keys";

type Get = () => Promise<RedisClient>;
const defaultGet: Get = () => getRedis();

/**
 * Atomically replace the published path set: build it under a staging key, then
 * RENAME over the live key so the filter never sees a half-written set.
 */
export async function replacePublishedPaths(paths: readonly string[], get: Get = defaultGet): Promise<void> {
  const c = await get();
  const tx = c.multi().del(KEYS.pathsStaging);
  for (let i = 0; i < paths.length; i += 1_000) tx.sAdd(KEYS.pathsStaging, paths.slice(i, i + 1_000) as string[]);
  if (paths.length > 0) tx.rename(KEYS.pathsStaging, KEYS.paths);
  else tx.del(KEYS.paths);
  tx.incr(KEYS.version);
  await tx.exec();
}

export async function publishedPathCount(get: Get = defaultGet): Promise<number> {
  return (await get()).sCard(KEYS.paths);
}

export async function getMode(get: Get = defaultGet): Promise<Mode> {
  return (await (await get()).get(KEYS.mode)) === "passthrough" ? "passthrough" : "enforce";
}

export async function setMode(mode: Mode, get: Get = defaultGet): Promise<void> {
  await (await get()).set(KEYS.mode, mode);
}

export type Counts = Record<Verdict, number> & { total: number; forwarded: number };

function toCounts(hash: Record<string, string>): Counts {
  const counts = { total: 0, forwarded: 0 } as Counts;
  for (const v of VERDICTS) {
    counts[v] = Number(hash[v] ?? 0);
    counts.total += counts[v];
    if (FORWARDED.includes(v)) counts.forwarded += counts[v];
  }
  return counts;
}

export type AttackSummary = {
  target: "filter" | "site";
  at: string;
  sent: number;
  reachedSite: number;
  blocked: number;
  /** Requests that got no answer at all. */
  failed?: number;
  durationMs: number;
};

export type Stats = {
  mode: Mode;
  publishedPaths: number;
  totals: Counts;
  /** Oldest first, one entry per minute. */
  minutes: { minute: number; counts: Counts }[];
  lastAttack: AttackSummary | null;
};

export async function getStats(minutes = 30, get: Get = defaultGet, now = Date.now()): Promise<Stats> {
  const c = await get();
  const current = Math.floor(now / 60_000);
  const ids = Array.from({ length: minutes }, (_, i) => current - minutes + 1 + i);
  const tx = c.multi().get(KEYS.mode).sCard(KEYS.paths).hGetAll(KEYS.totals).get(KEYS.lastAttack);
  for (const m of ids) tx.hGetAll(KEYS.minute(m));
  const [mode, count, totals, lastAttack, ...buckets] = (await tx.exec()) as unknown as [
    string | null,
    number,
    Record<string, string>,
    string | null,
    ...Record<string, string>[],
  ];
  let parsedAttack: AttackSummary | null = null;
  try {
    parsedAttack = lastAttack ? (JSON.parse(lastAttack) as AttackSummary) : null;
  } catch {
    parsedAttack = null;
  }
  return {
    mode: mode === "passthrough" ? "passthrough" : "enforce",
    publishedPaths: Number(count),
    totals: toCounts(totals),
    minutes: ids.map((minute, i) => ({ minute, counts: toCounts(buckets[i] ?? {}) })),
    lastAttack: parsedAttack,
  };
}

export async function resetStats(get: Get = defaultGet): Promise<void> {
  const c = await get();
  const keys: string[] = [KEYS.totals, KEYS.lastAttack];
  for await (const batch of c.scanIterator({ MATCH: "filter:stats:m:*", COUNT: 500 })) {
    keys.push(...(Array.isArray(batch) ? batch : [batch]));
  }
  await c.del(keys);
}

export async function saveLastAttack(summary: AttackSummary, get: Get = defaultGet): Promise<void> {
  await (await get()).set(KEYS.lastAttack, JSON.stringify(summary));
}

/** Up to `count` random published paths (for demo traffic). */
export async function samplePublishedPaths(count: number, get: Get = defaultGet): Promise<string[]> {
  return (await get()).sRandMemberCount(KEYS.paths, count);
}

import { getRedis, withTimeout, type RedisClient } from "./client";
import { KEYS, MINUTE_BUCKET_TTL_SECONDS, type Mode, type Verdict } from "./keys";

/** What the filter needs from its store. Kept small so the store can be swapped. */
export interface FilterStore {
  isPublished(path: string): Promise<boolean>;
  mode(): Promise<Mode>;
  record(verdict: Verdict): Promise<void>;
}

type Options = {
  getClient?: () => Promise<RedisClient>;
  /** Max time for any single lookup before the caller fails open. */
  timeoutMs?: number;
  /** How long a lookup result is trusted before asking Redis again. */
  cacheMs?: number;
  /** How often to check whether a publish happened (which clears the cache). */
  versionCheckMs?: number;
  maxCacheEntries?: number;
  /** After a failure, skip Redis for this long so requests fail open instantly. */
  retryAfterMs?: number;
  now?: () => number;
};

/**
 * Redis-backed store with a small in-process cache, so most requests (including
 * repeated bot probes for the same bogus path) never leave the process. A publish
 * bumps KEYS.version; instances notice within versionCheckMs and drop their cache.
 */
export function createRedisFilterStore(opts: Options = {}): FilterStore {
  const getClient = opts.getClient ?? (() => getRedis());
  const timeoutMs = opts.timeoutMs ?? 150;
  const cacheMs = opts.cacheMs ?? 5_000;
  const versionCheckMs = opts.versionCheckMs ?? 1_000;
  const maxEntries = opts.maxCacheEntries ?? 10_000;
  const retryAfterMs = opts.retryAfterMs ?? 2_000;
  const now = opts.now ?? Date.now;
  let unavailableUntil = 0;

  const cache = new Map<string, { published: boolean; expires: number }>();
  let knownVersion: string | null = null;
  let versionCheckedAt = 0;
  let cachedMode: { mode: Mode; expires: number } | null = null;

  const client = () => withTimeout(getClient(), timeoutMs);

  // Short circuit breaker: one slow or failed call marks Redis down for retryAfterMs,
  // so an outage costs one timeout every couple of seconds, not one per request.
  async function guarded<T>(op: () => Promise<T>): Promise<T> {
    if (now() < unavailableUntil) throw new Error("redis marked unavailable");
    try {
      return await op();
    } catch (err) {
      unavailableUntil = now() + retryAfterMs;
      throw err;
    }
  }

  async function syncVersion(c: RedisClient) {
    if (now() - versionCheckedAt < versionCheckMs) return;
    versionCheckedAt = now();
    const v = await withTimeout(c.get(KEYS.version), timeoutMs);
    if (v === null) {
      // Nothing has ever been published to this Redis (new or wiped instance). An empty
      // set would block every page, so treat it as unavailable and fail open instead.
      versionCheckedAt = 0;
      throw new Error("published paths not initialised");
    }
    if (v !== knownVersion) {
      cache.clear();
      knownVersion = v;
    }
  }

  return {
    isPublished: (path) =>
      guarded(async () => {
        const c = await client();
        await syncVersion(c);
        const hit = cache.get(path);
        if (hit && hit.expires > now()) return hit.published;
        const published = Number(await withTimeout(c.sIsMember(KEYS.paths, path), timeoutMs)) === 1;
        if (cache.size >= maxEntries) cache.clear();
        cache.set(path, { published, expires: now() + cacheMs });
        return published;
      }),

    mode: () =>
      guarded(async () => {
        if (cachedMode && cachedMode.expires > now()) return cachedMode.mode;
        const c = await client();
        const raw = await withTimeout(c.get(KEYS.mode), timeoutMs);
        const mode: Mode = raw === "passthrough" ? "passthrough" : "enforce";
        cachedMode = { mode, expires: now() + Math.min(cacheMs, 1_000) };
        return mode;
      }),

    record: (verdict) =>
      guarded(async () => {
        const c = await client();
        const minute = Math.floor(now() / 60_000);
        await withTimeout(
          c
            .multi()
            .hIncrBy(KEYS.totals, verdict, 1)
            .hIncrBy(KEYS.minute(minute), verdict, 1)
            .expire(KEYS.minute(minute), MINUTE_BUCKET_TTL_SECONDS)
            .exec(),
          timeoutMs * 2,
        );
      }),
  };
}

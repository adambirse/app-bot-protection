// Every Redis key the filter, the CMS and the dashboard share, in one place.
export const KEYS = {
  /** Set of published, canonical paths (see @cms-bot/db/paths normalisePath). */
  paths: "filter:paths",
  pathsStaging: "filter:paths:staging",
  /** Incremented on every publish so filter instances can drop cached lookups. */
  version: "filter:version",
  /** "enforce" (default) or "passthrough". */
  mode: "filter:mode",
  /** Hash of verdict -> count since the last reset. */
  totals: "filter:stats:totals",
  /** Hash of verdict -> count for one minute (epoch minutes). */
  minute: (epochMinute: number) => `filter:stats:m:${epochMinute}`,
  /** JSON summary of the last demo attack run from the dashboard. */
  lastAttack: "filter:demo:last-attack",
} as const;

export const VERDICTS = ["allowed", "blocked", "passthrough", "fail-open", "rejected"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Verdicts whose requests were forwarded to the site. */
export const FORWARDED: readonly Verdict[] = ["allowed", "passthrough", "fail-open"];

export type Mode = "enforce" | "passthrough";

export const MINUTE_BUCKET_TTL_SECONDS = 2 * 60 * 60;

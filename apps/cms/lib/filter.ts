import "server-only";
import { publishStatus, syncPublishedPaths } from "@cms-bot/db/cms";
import { getStats, replacePublishedPaths, withTimeout, type Stats } from "@cms-bot/filter-store";

const SYNC_TIMEOUT_MS = 5_000;

/** The filter integration is optional: without REDIS_URL the CMS works exactly as before. */
export function filterConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Push the live path set to the filter. Returns false (and logs) on failure rather than
 * throwing: the publish itself has already succeeded, and the dashboard can resync.
 */
export async function pushPathsToFilter(): Promise<boolean> {
  if (!filterConfigured()) return true;
  try {
    await syncPublishedPaths((paths) => withTimeout(replacePublishedPaths(paths), SYNC_TIMEOUT_MS));
    return true;
  } catch (err) {
    console.error(`[filter] could not update published paths: ${(err as Error).message}`);
    return false;
  }
}

/** Fixed demo targets from configuration only; never from the request. */
export function demoTargets(): { filter: string | null; site: string | null } {
  return { filter: originOrNull(process.env.FILTER_URL), site: originOrNull(process.env.SITE_URL) };
}

function originOrNull(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export type FilterStats =
  | { available: false; reason: "not_configured" | "redis_unavailable" }
  | ({ available: true; livePages: number } & Stats);

export async function loadFilterStats(): Promise<FilterStats> {
  if (!filterConfigured()) return { available: false, reason: "not_configured" };
  try {
    const [stats, live] = await Promise.all([withTimeout(getStats(30), 2_000), publishStatus()]);
    return { available: true, livePages: live.liveCount, ...stats };
  } catch (err) {
    console.error(`[filter] could not read stats: ${(err as Error).message}`);
    return { available: false, reason: "redis_unavailable" };
  }
}

import { createRedisFilterStore, getRedis } from "@cms-bot/filter-store";
import { createFilterApp, type FilterAppOptions } from "./filter-app";
import { loadFilterConfig } from "./config";

/** Build the filter from environment variables (throws FilterConfigError if they're wrong). */
export function createFilterAppFromEnv(extra: Pick<FilterAppOptions, "waitUntil"> = {}) {
  const config = loadFilterConfig();
  const redisUrl = config.redisUrl;
  if (!redisUrl) console.warn("[filter] REDIS_URL is not set: every request will be passed to the site");
  // Start connecting now so the first request doesn't pay for the connection setup.
  // Failures are handled (and fail open) on the request path.
  if (redisUrl) getRedis(redisUrl).catch(() => {});
  const store = redisUrl
    ? createRedisFilterStore({ getClient: () => getRedis(redisUrl), timeoutMs: config.lookupTimeoutMs })
    : null;
  return createFilterApp({
    siteOrigin: config.siteOrigin,
    originSecret: config.originSecret,
    requiredFdid: config.requiredFdid,
    lookupTimeoutMs: config.lookupTimeoutMs,
    store,
    ...extra,
  });
}

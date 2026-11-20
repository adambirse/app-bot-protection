import { createRedisFilterStore, getRedis } from "@cms-bot/filter-store";
import { createFilterApp, type FilterAppOptions } from "./app";
import { loadFilterConfig } from "./config";

/** Build the filter from environment variables (throws FilterConfigError if they're wrong). */
export function createFilterAppFromEnv(extra: Pick<FilterAppOptions, "waitUntil"> = {}) {
  const config = loadFilterConfig();
  const redisUrl = config.redisUrl;
  if (!redisUrl) console.warn("[filter] REDIS_URL is not set: every request will be passed to the site");
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

export class FilterConfigError extends Error {}

export type FilterConfig = {
  siteOrigin: string;
  originSecret: string | undefined;
  redisUrl: string | undefined;
  requiredFdid: string | undefined;
  lookupTimeoutMs: number;
};

export const MIN_SECRET_LENGTH = 32;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read and check the filter's settings once at startup. Missing or malformed settings
 * stop the filter rather than silently weakening it. In production the origin secret
 * and REDIS_URL are required; at runtime an unreachable Redis still fails open.
 */
export function loadFilterConfig(env: NodeJS.ProcessEnv = process.env): FilterConfig {
  const production = env.NODE_ENV === "production";

  const rawOrigin = env.SITE_ORIGIN?.trim();
  if (!rawOrigin) throw new FilterConfigError("SITE_ORIGIN must be set");
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new FilterConfigError("SITE_ORIGIN must be an absolute URL");
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new FilterConfigError("SITE_ORIGIN must use http or https");
  }
  if (production && origin.protocol !== "https:") {
    throw new FilterConfigError("SITE_ORIGIN must use https in production");
  }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new FilterConfigError("SITE_ORIGIN must be an origin only, like https://site.example.com");
  }

  const originSecret = env.FILTER_ORIGIN_SECRET || undefined;
  if (originSecret !== undefined && originSecret.length < MIN_SECRET_LENGTH) {
    throw new FilterConfigError(`FILTER_ORIGIN_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (production && originSecret === undefined) {
    throw new FilterConfigError("FILTER_ORIGIN_SECRET must be set in production");
  }

  const redisUrl = env.REDIS_URL || undefined;
  if (production && redisUrl === undefined) throw new FilterConfigError("REDIS_URL must be set in production");

  const requiredFdid = env.REQUIRED_FDID?.trim() || undefined;
  if (requiredFdid !== undefined && !GUID.test(requiredFdid)) {
    throw new FilterConfigError("REQUIRED_FDID must be the Front Door ID (a GUID)");
  }

  const lookupTimeoutMs = env.LOOKUP_TIMEOUT_MS ? Number(env.LOOKUP_TIMEOUT_MS) : 150;
  if (!Number.isInteger(lookupTimeoutMs) || lookupTimeoutMs < 10 || lookupTimeoutMs > 5_000) {
    throw new FilterConfigError("LOOKUP_TIMEOUT_MS must be a whole number between 10 and 5000");
  }

  return { siteOrigin: origin.origin, originSecret, redisUrl, requiredFdid, lookupTimeoutMs };
}

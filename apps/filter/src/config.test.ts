import { describe, it, expect } from "vitest";
import { loadFilterConfig } from "./config";

const base = { SITE_ORIGIN: "http://localhost:3001" };
const secret = "x".repeat(32);

describe("loadFilterConfig", () => {
  it("accepts a minimal local configuration", () => {
    expect(loadFilterConfig({ ...base } as NodeJS.ProcessEnv)).toMatchObject({
      siteOrigin: "http://localhost:3001",
      originSecret: undefined,
      redisUrl: undefined,
      lookupTimeoutMs: 150,
    });
  });

  it.each([
    [{}, /SITE_ORIGIN must be set/],
    [{ SITE_ORIGIN: "not a url" }, /absolute URL/],
    [{ SITE_ORIGIN: "ftp://x" }, /http or https/],
    [{ SITE_ORIGIN: "https://site.example/path" }, /origin only/],
    [{ SITE_ORIGIN: "https://u:p@site.example" }, /origin only/],
    [{ ...base, FILTER_ORIGIN_SECRET: "short" }, /at least 32/],
    [{ ...base, REQUIRED_FDID: "not-a-guid" }, /GUID/],
    [{ ...base, LOOKUP_TIMEOUT_MS: "0" }, /LOOKUP_TIMEOUT_MS/],
    [{ ...base, LOOKUP_TIMEOUT_MS: "abc" }, /LOOKUP_TIMEOUT_MS/],
  ])("rejects %j", (env, message) => {
    expect(() => loadFilterConfig(env as NodeJS.ProcessEnv)).toThrow(message);
  });

  it("requires https, a secret and Redis in production", () => {
    const prod = { NODE_ENV: "production", SITE_ORIGIN: "https://site.example", REDIS_URL: "rediss://r", FILTER_ORIGIN_SECRET: secret };
    expect(() => loadFilterConfig(prod as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => loadFilterConfig({ ...prod, SITE_ORIGIN: "http://site.example" } as NodeJS.ProcessEnv)).toThrow(/https/);
    expect(() => loadFilterConfig({ ...prod, FILTER_ORIGIN_SECRET: "" } as NodeJS.ProcessEnv)).toThrow(/FILTER_ORIGIN_SECRET/);
    expect(() => loadFilterConfig({ ...prod, REDIS_URL: "" } as NodeJS.ProcessEnv)).toThrow(/REDIS_URL/);
  });
});

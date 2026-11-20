// Runs against a real Redis. Skipped unless REDIS_TEST_URL is set; the database it
// points at is flushed, so use a spare one (e.g. redis://localhost:6379/14).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@redis/client";
import { createRedisFilterStore } from "./filter-store";
import { getStats, replacePublishedPaths, resetStats, setMode, getMode, saveLastAttack } from "./admin";
import { KEYS } from "./keys";
import type { RedisClient } from "./client";

const url = process.env.REDIS_TEST_URL;

describe.skipIf(!url)("redis filter store", () => {
  const client = createClient({ url }) as unknown as RedisClient;
  const get = async () => {
    if (!client.isOpen) await client.connect();
    return client;
  };

  beforeEach(async () => {
    await (await get()).flushDb();
  });

  afterAll(async () => {
    if (client.isOpen) client.destroy();
  });

  it("fails open (throws) until something has been published", async () => {
    const store = createRedisFilterStore({ getClient: get });
    await expect(store.isPublished("/")).rejects.toThrow(/not initialised/);
  });

  it("answers from the published set, and an empty publish blocks everything", async () => {
    const store = createRedisFilterStore({ getClient: get });
    await replacePublishedPaths(["/", "/about"], get);
    expect(await store.isPublished("/about")).toBe(true);
    expect(await store.isPublished("/wp-admin")).toBe(false);

    await replacePublishedPaths([], get);
    const fresh = createRedisFilterStore({ getClient: get });
    expect(await fresh.isPublished("/about")).toBe(false);
  });

  it("drops cached answers once a new publish is seen", async () => {
    let t = 0;
    const store = createRedisFilterStore({ getClient: get, now: () => t, cacheMs: 60_000, versionCheckMs: 1_000 });
    await replacePublishedPaths(["/old"], get);
    expect(await store.isPublished("/new")).toBe(false);

    await replacePublishedPaths(["/new"], get);
    t = 500; // still inside the version-check interval: cached answer
    expect(await store.isPublished("/new")).toBe(false);
    t = 1_500; // version re-checked, cache cleared
    expect(await store.isPublished("/new")).toBe(true);
    expect(await store.isPublished("/old")).toBe(false);
  });

  it("replaces the set atomically and handles large sets", async () => {
    const many = Array.from({ length: 2_500 }, (_, i) => `/p${i}`);
    await replacePublishedPaths(many, get);
    const c = await get();
    expect(await c.sCard(KEYS.paths)).toBe(2_500);
    expect(await c.exists(KEYS.pathsStaging)).toBe(0);
  });

  it("reads the mode, defaulting to enforce", async () => {
    const store = createRedisFilterStore({ getClient: get });
    expect(await getMode(get)).toBe("enforce");
    expect(await store.mode()).toBe("enforce");
    await setMode("passthrough", get);
    const fresh = createRedisFilterStore({ getClient: get });
    expect(await fresh.mode()).toBe("passthrough");
  });

  it("counts verdicts in totals and per-minute buckets, and resets them", async () => {
    const now = Date.UTC(2026, 10, 20, 12, 0, 30);
    const store = createRedisFilterStore({ getClient: get, now: () => now });
    await replacePublishedPaths(["/"], get);
    await store.record("allowed");
    await store.record("blocked");
    await store.record("blocked");
    await store.record("fail-open");
    await saveLastAttack({ target: "filter", at: "x", sent: 3, reachedSite: 1, blocked: 2, durationMs: 5 }, get);

    const stats = await getStats(5, get, now);
    expect(stats.totals).toMatchObject({ allowed: 1, blocked: 2, "fail-open": 1, total: 4, forwarded: 2 });
    expect(stats.minutes).toHaveLength(5);
    expect(stats.minutes[4].counts.blocked).toBe(2);
    expect(stats.minutes[0].counts.total).toBe(0);
    expect(stats.publishedPaths).toBe(1);
    expect(stats.lastAttack?.blocked).toBe(2);

    await resetStats(get);
    const after = await getStats(5, get, now);
    expect(after.totals.total).toBe(0);
    expect(after.lastAttack).toBeNull();
    expect(after.publishedPaths).toBe(1); // published paths are untouched
  });
});

describe("redis filter store without a server", () => {
  it("times out quickly and then skips Redis for a while (circuit breaker)", async () => {
    let calls = 0;
    let t = 0;
    const store = createRedisFilterStore({
      getClient: () => {
        calls++;
        return new Promise<never>(() => {}); // never connects
      },
      timeoutMs: 20,
      retryAfterMs: 1_000,
      now: () => t,
    });
    const started = Date.now();
    await expect(store.isPublished("/")).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(500);
    await expect(store.isPublished("/")).rejects.toThrow(/unavailable/);
    expect(calls).toBe(1);
    t = 2_000;
    await expect(store.isPublished("/")).rejects.toThrow(/timed out/);
    expect(calls).toBe(2);
  });
});

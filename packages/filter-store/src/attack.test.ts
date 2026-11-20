import { describe, it, expect } from "vitest";
import { attackPaths } from "./attack";

describe("attackPaths", () => {
  it("mixes scanner paths, random paths and some real pages", () => {
    const paths = attackPaths(["/about"], 1_000);
    expect(paths).toHaveLength(1_000);
    const real = paths.filter((p) => p === "/about").length;
    expect(real).toBeGreaterThan(100);
    expect(real).toBeLessThan(300);
    expect(paths.some((p) => p === "/wp-admin" || p === "/.env")).toBe(true);
    for (const p of paths) expect(p.startsWith("/")).toBe(true);
  });

  it("works with no real pages", () => {
    expect(attackPaths([], 50).every((p) => p !== "")).toBe(true);
  });
});

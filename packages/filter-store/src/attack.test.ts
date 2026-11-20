import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { attackPaths, runAttack } from "./attack";

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

describe("runAttack", () => {
  it("counts requests stopped by the filter or a firewall as blocked, the rest as reaching the site", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/filtered") res.setHeader("x-filter", "blocked");
      if (req.url === "/firewalled") res.setHeader("x-vercel-mitigated", "deny");
      res.statusCode = req.url === "/ok" ? 200 : 403;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const result = await runAttack(`http://127.0.0.1:${port}`, ["/ok", "/filtered", "/firewalled", "/ok"]);
      expect(result).toMatchObject({ sent: 4, reachedSite: 2, blocked: 2, failed: 0 });
    } finally {
      server.close();
    }
  });
});

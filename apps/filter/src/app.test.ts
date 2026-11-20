import { describe, it, expect, vi } from "vitest";
import type { FilterStore, Mode, Verdict } from "@cms-bot/filter-store";
import { createFilterApp, pagePath, type FilterAppOptions } from "./app";

const SITE = "http://site.internal:3001";
const SECRET = "s".repeat(40);
const FDID = "8f1c2d3e-4b5a-6789-abcd-ef0123456789";

function fakeStore(published: string[], mode: Mode = "enforce") {
  const recorded: Verdict[] = [];
  const store: FilterStore & { recorded: Verdict[] } = {
    recorded,
    isPublished: vi.fn(async (p: string) => published.includes(p)),
    mode: vi.fn(async () => mode),
    record: vi.fn(async (v: Verdict) => void recorded.push(v)),
  };
  return store;
}

function setup(overrides: Partial<FilterAppOptions> = {}, originResponse?: () => Response) {
  const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
    originResponse ? originResponse() : new Response("site page", { status: 200, headers: { "content-type": "text/html" } }),
  );
  const store = fakeStore(["/", "/about"]);
  const app = createFilterApp({
    siteOrigin: SITE,
    originSecret: SECRET,
    store,
    fetch: fetch as unknown as typeof globalThis.fetch,
    log: () => {},
    ...overrides,
  });
  const request = (path: string, init?: RequestInit) => app.fetch(new Request(`https://filter.example${path}`, init));
  return { app, fetch, store, request };
}

const forwardedHeaders = (fetch: ReturnType<typeof setup>["fetch"]) => new Headers(fetch.mock.calls[0][1]!.headers);

describe("pagePath", () => {
  it("matches the site's canonical paths", () => {
    expect(pagePath("/")).toBe("/");
    expect(pagePath("/About/")).toBe("/about");
    expect(pagePath("/a//b")).toBe("/a/b");
    expect(pagePath("/caf%C3%A9")).toBeNull();
    expect(pagePath("/a%2fb")).toBeNull();
    expect(pagePath("/%E0%A4%A")).toBeNull();
    expect(pagePath("/" + "a".repeat(300))).toBeNull();
  });
});

describe("filter", () => {
  it("forwards published pages to the site with the origin secret", async () => {
    const { request, fetch, store } = setup();
    const res = await request("/about?x=1", { headers: { "x-filter-secret": "forged", cookie: "a=b" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("site page");
    expect(res.headers.get("x-filter")).toBe("allowed");
    expect(Number(res.headers.get("x-filter-ms"))).toBeGreaterThanOrEqual(0);
    expect(String(fetch.mock.calls[0][0])).toBe(`${SITE}/about?x=1`);
    const sent = forwardedHeaders(fetch);
    expect(sent.get("x-filter-secret")).toBe(SECRET);
    expect(sent.get("cookie")).toBe("a=b");
    expect(sent.has("host")).toBe(false);
    expect(store.recorded).toEqual(["allowed"]);
  });

  it("blocks unpublished paths without contacting the site", async () => {
    const { request, fetch, store } = setup();
    for (const path of ["/wp-admin", "/.env", "/about/x", "/a%2fb", "/%E0%A4%A"]) {
      const res = await request(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("x-filter")).toBe("blocked");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("Not found\n");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(store.recorded).toEqual(Array(5).fill("blocked"));
  });

  it("does not echo anything from the request in a blocked response", async () => {
    const { request } = setup();
    const res = await request("/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(await res.text()).toBe("Not found\n");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sends no body for a blocked HEAD request", async () => {
    const { request } = setup();
    const res = await request("/nope", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("passes everything through when switched off", async () => {
    const { request, fetch } = setup({ store: fakeStore([], "passthrough") });
    const res = await request("/wp-admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-filter")).toBe("passthrough");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fails open when the store errors", async () => {
    const store = fakeStore([]);
    store.mode = vi.fn(async () => Promise.reject(new Error("ECONNREFUSED")));
    const { request } = setup({ store });
    const res = await request("/wp-admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-filter")).toBe("fail-open");
  });

  it("fails open when the store is too slow", async () => {
    const store = fakeStore([]);
    store.isPublished = vi.fn(() => new Promise<boolean>(() => {}));
    const { request } = setup({ store, lookupTimeoutMs: 20 });
    const started = Date.now();
    const res = await request("/about");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(res.headers.get("x-filter")).toBe("fail-open");
  });

  it("fails open when no store is configured", async () => {
    const { request } = setup({ store: null });
    expect((await request("/wp-admin")).headers.get("x-filter")).toBe("fail-open");
  });

  it("lets framework assets through without a lookup and without counting them", async () => {
    const { request, store, fetch } = setup();
    const res = await request("/_next/static/chunks/app.js");
    expect(res.headers.get("x-filter")).toBe("allowed");
    expect(store.isPublished).not.toHaveBeenCalled();
    expect(store.recorded).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("only accepts requests from the configured Azure Front Door profile", async () => {
    const { request, fetch } = setup({ requiredFdid: FDID });
    const missing = await request("/about");
    expect(missing.status).toBe(403);
    expect(missing.headers.get("x-filter")).toBe("rejected");
    const wrong = await request("/about", { headers: { "x-azure-fdid": "00000000-0000-0000-0000-000000000000" } });
    expect(wrong.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    const right = await request("/about", { headers: { "x-azure-fdid": FDID } });
    expect(right.status).toBe(200);
  });

  it("strips hop-by-hop headers both ways and keeps redirects on the filter's address", async () => {
    const { request, fetch } = setup({}, () =>
      new Response(null, {
        status: 308,
        headers: { location: `${SITE}/about`, connection: "x-internal", "x-internal": "1", "keep-alive": "timeout=5" },
      }),
    );
    const res = await request("/about", { headers: { connection: "x-hop", "x-hop": "1", te: "trailers" } });
    const sent = forwardedHeaders(fetch);
    expect(sent.has("x-hop")).toBe(false);
    expect(sent.has("te")).toBe(false);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/about");
    expect(res.headers.has("x-internal")).toBe(false);
    expect(res.headers.has("keep-alive")).toBe(false);
  });

  it("never forwards to another host, even for protocol-relative paths", async () => {
    for (const mode of ["passthrough", "enforce"] as const) {
      const { app, fetch } = setup({ store: fakeStore(["/evil.example/x"], mode) });
      for (const raw of ["//evil.example/x", "///evil.example/x", "/\\evil.example/x"]) {
        await app.fetch(new Request(`https://filter.example${raw}`));
      }
      for (const call of fetch.mock.calls) expect(new URL(String(call[0])).origin).toBe(SITE);
    }
  });

  it("leaves redirects to other sites alone", async () => {
    const { request } = setup({}, () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/x" } }));
    expect((await request("/about")).headers.get("location")).toBe("https://elsewhere.example/x");
  });

  it("drops encoding headers for bodies fetch has already decoded", async () => {
    const { request } = setup({}, () =>
      new Response("decoded", { headers: { "content-encoding": "gzip", "content-length": "99" } }),
    );
    const res = await request("/about");
    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
  });

  it("forwards request bodies for other methods", async () => {
    const { request, fetch } = setup();
    await request("/about", { method: "POST", body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
    const init = fetch.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(await new Response(init.body).text()).toBe("a=1");
  });

  it("returns 502 if the site can't be reached", async () => {
    const { request } = setup({}, () => {
      throw new TypeError("fetch failed");
    });
    const res = await request("/about");
    expect(res.status).toBe(502);
    expect(res.headers.get("x-filter")).toBe("allowed");
  });

  it("keeps stats recording off the response path", async () => {
    const store = fakeStore(["/"]);
    let finish!: () => void;
    store.record = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const waitUntil = vi.fn();
    const { request } = setup({ store, waitUntil });
    const res = await request("/");
    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledOnce();
    finish();
  });
});

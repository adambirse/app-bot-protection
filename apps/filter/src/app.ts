import { Hono } from "hono";
import { pathFromSegments } from "@cms-bot/db/paths";
import { withTimeout, type FilterStore, type Verdict } from "@cms-bot/filter-store";
import { forwardToSite } from "./forward";

/** Framework files the site needs to render published pages. Not counted in the stats. */
export const ASSET_PREFIXES = ["/_next/static/", "/_next/image", "/favicon.ico", "/robots.txt"];

export type FilterAppOptions = {
  siteOrigin: string;
  originSecret?: string;
  /** If set, requests must carry this X-Azure-FDID (Azure Front Door profile ID). */
  requiredFdid?: string;
  /** null when no store is configured: every request fails open. */
  store: FilterStore | null;
  /** Upper bound on the published-path decision before failing open. */
  lookupTimeoutMs?: number;
  originTimeoutMs?: number;
  fetch?: typeof fetch;
  /** Keeps background work (stats) alive after the response on serverless hosts. */
  waitUntil?: (p: Promise<unknown>) => void;
  log?: (message: string) => void;
};

/** The canonical page path for a URL path, or null if no page can live there. */
export function pagePath(pathname: string): string | null {
  return pathFromSegments(pathname.split("/").slice(1));
}

export function createFilterApp(opts: FilterAppOptions) {
  const lookupTimeoutMs = opts.lookupTimeoutMs ?? 150;
  const doFetch = opts.fetch ?? fetch;
  const log = opts.log ?? ((m: string) => console.warn(`[filter] ${m}`));
  const store = opts.store;

  async function decide(pathname: string): Promise<Verdict> {
    if (!store) return "fail-open";
    try {
      return await withTimeout(
        (async (): Promise<Verdict> => {
          if ((await store.mode()) === "passthrough") return "passthrough";
          const path = pagePath(pathname);
          if (path === null) return "blocked";
          return (await store.isPublished(path)) ? "allowed" : "blocked";
        })(),
        lookupTimeoutMs,
      );
    } catch (err) {
      log(`store unavailable, failing open: ${(err as Error).message}`);
      return "fail-open";
    }
  }

  function record(verdict: Verdict) {
    if (!store) return;
    const p = store.record(verdict).catch(() => {});
    opts.waitUntil?.(p);
  }

  function plain(req: Request, status: number, text: string, verdict: Verdict, ms: string) {
    return new Response(req.method === "HEAD" ? null : `${text}\n`, {
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-filter": verdict,
        "x-filter-ms": ms,
      },
    });
  }

  const app = new Hono();
  app.all("*", async (c) => {
    const req = c.req.raw;
    const started = performance.now();
    const url = new URL(req.url);
    const elapsed = () => (performance.now() - started).toFixed(2);

    if (opts.requiredFdid && req.headers.get("x-azure-fdid") !== opts.requiredFdid) {
      record("rejected");
      return plain(req, 403, "Forbidden", "rejected", elapsed());
    }

    const isAsset = ASSET_PREFIXES.some((p) => url.pathname.startsWith(p));
    const verdict: Verdict = isAsset ? "allowed" : await decide(url.pathname);
    const ms = elapsed();
    if (!isAsset) record(verdict);
    if (verdict === "blocked") return plain(req, 404, "Not found", verdict, ms);

    let res: Response;
    try {
      res = await forwardToSite(req, url, {
        siteOrigin: opts.siteOrigin,
        originSecret: opts.originSecret,
        timeoutMs: opts.originTimeoutMs ?? 30_000,
        fetch: doFetch,
      });
    } catch (err) {
      log(`site unreachable: ${(err as Error).message}`);
      return plain(req, 502, "Bad gateway", verdict, ms);
    }
    res.headers.set("x-filter", verdict);
    res.headers.set("x-filter-ms", ms);
    return res;
  });
  return app;
}

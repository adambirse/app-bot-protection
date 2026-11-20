// Headers that describe one hop of a connection and must not be passed on (RFC 9110 7.6.1).
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export const ORIGIN_SECRET_HEADER = "x-filter-secret";

function stripHopByHop(headers: Headers) {
  const listed = headers.get("connection");
  if (listed) for (const name of listed.split(",")) headers.delete(name.trim());
  for (const name of HOP_BY_HOP) headers.delete(name);
}

export type ForwardOptions = {
  siteOrigin: string;
  originSecret: string | undefined;
  timeoutMs: number;
  fetch: typeof fetch;
};

/**
 * Pass a request on to the site unchanged apart from hop-by-hop headers, and add the
 * shared secret so the site (or its firewall) can refuse requests that skipped the filter.
 */
export async function forwardToSite(req: Request, url: URL, opts: ForwardOptions): Promise<Response> {
  // Concatenate rather than resolve: resolving "//evil.example/x" against the origin
  // would send the request (and the secret) to another host.
  const target = new URL(opts.siteOrigin + url.pathname + url.search);
  if (target.origin !== opts.siteOrigin) throw new Error("refusing to forward outside the site origin");
  const headers = new Headers(req.headers);
  stripHopByHop(headers);
  headers.delete("host");
  headers.delete("content-length");
  // fetch negotiates and decodes compression itself.
  headers.delete("accept-encoding");
  // Never let a client supply the secret, even a wrong one.
  headers.delete(ORIGIN_SECRET_HEADER);
  if (opts.originSecret) headers.set(ORIGIN_SECRET_HEADER, opts.originSecret);

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== null;
  const res = await opts.fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(opts.timeoutMs),
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);

  const out = new Headers(res.headers);
  stripHopByHop(out);
  if (out.has("content-encoding")) {
    // The body has already been decoded, so its encoding and length no longer apply.
    out.delete("content-encoding");
    out.delete("content-length");
  }
  // Keep visitors on the filter's address if the site redirects to its own.
  const location = out.get("location");
  if (location) {
    try {
      const loc = new URL(location, opts.siteOrigin);
      if (loc.origin === opts.siteOrigin) out.set("location", loc.pathname + loc.search + loc.hash);
    } catch {
      out.delete("location");
    }
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

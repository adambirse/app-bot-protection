import { loadAuthConfig, ConfigError, type AuthConfig } from "./config";
import { checkBasicAuth } from "./basic-auth";
import { createNonce, contentSecurityPolicy, securityHeaders, applyHeaders } from "./headers";

let cached: AuthConfig | ConfigError | undefined;
function authConfig(): AuthConfig | ConfigError {
  if (!cached) {
    try {
      cached = loadAuthConfig();
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      cached = err;
    }
  }
  return cached;
}

export type ProxyDecision =
  | { kind: "respond"; response: Response }
  | { kind: "continue"; requestHeaders: Headers; responseHeaders: Record<string, string> };

/**
 * Shared proxy (middleware) logic: fail closed on bad config, enforce basic auth,
 * and attach security headers to every response, including errors.
 */
export function runSecurityProxy(
  request: Request,
  realm: string,
  config: AuthConfig | ConfigError = authConfig(),
): ProxyDecision {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce, isDev);
  const headers = securityHeaders(csp);

  if (config instanceof ConfigError) {
    console.error(`[security] refusing request: ${config.message}`);
    return { kind: "respond", response: applyHeaders(new Response("Server misconfigured", { status: 500 }), headers) };
  }

  // Malformed percent-encoding can't match any page; answer 404 here rather than let
  // the framework's router fail on it with a 500.
  try {
    decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return { kind: "respond", response: applyHeaders(new Response("Not found", { status: 404 }), headers) };
  }

  if (!checkBasicAuth(request.headers.get("authorization"), config).ok) {
    const response = new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"` },
    });
    return { kind: "respond", response: applyHeaders(response, headers) };
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  return { kind: "continue", requestHeaders, responseHeaders: headers };
}

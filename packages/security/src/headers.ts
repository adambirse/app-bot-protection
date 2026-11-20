import { randomBytes } from "node:crypto";

export function createNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Strict nonce-based CSP. Next.js reads the nonce from the request's
 * Content-Security-Policy header and applies it to its own scripts.
 * Dev mode needs eval and inline styles for hot reloading.
 */
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaders(csp: string): Record<string, string> {
  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

export function applyHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

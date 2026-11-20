export const MAX_PATH_LENGTH = 255;

// Unreserved URL characters only. Anything else is rejected rather than escaped.
const VALID_PATH = /^\/(?:[a-z0-9\-._~]+(?:\/[a-z0-9\-._~]+)*)?$/;

/**
 * Canonical form for a page path: leading slash, no trailing slash (except "/"),
 * no repeated slashes, lower case. The CMS (on save), the site (on lookup) and the
 * future filter app all use this, so they always agree on a key.
 */
export function normalisePath(input: string): string {
  let p = input.trim().toLowerCase();
  p = p.split(/[?#]/)[0];
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function isValidPath(p: string): boolean {
  return p.length <= MAX_PATH_LENGTH && VALID_PATH.test(p) && !/(^|\/)\.{1,2}(\/|$)/.test(p);
}

/**
 * Turn the raw (still percent-encoded) catch-all segments from the site's route
 * into a canonical path, or null if they can't be a published page. Each segment
 * is decoded exactly once; malformed encodings and encoded slashes are rejected.
 */
export function pathFromSegments(segments: readonly string[]): string | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    let s: string;
    try {
      s = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (s.includes("/")) return null;
    decoded.push(s);
  }
  const path = normalisePath("/" + decoded.join("/"));
  return isValidPath(path) ? path : null;
}

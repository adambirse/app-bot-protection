/**
 * Canonical form for a page path: leading slash, no trailing slash (except "/"),
 * no repeated slashes, lower-case. Both the CMS (on save) and the site (on lookup)
 * use this, and a future filter app should too, so they always agree on a key.
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
  return /^\/[a-z0-9\-._~\/]*$/.test(p);
}

import { getPool } from "./pool";
import { pathFromSegments } from "./paths";

export type SitePage = { path: string; title: string; body: string; published_at: Date };

/**
 * Look up a published page from the raw catch-all route segments. Paths that can't
 * be valid pages are rejected without touching the database.
 * The site app only ever reads from the site schema.
 */
export async function findSitePage(segments: readonly string[]): Promise<SitePage | null> {
  const path = pathFromSegments(segments);
  if (path === null) return null;
  const { rows } = await getPool().query<SitePage>(
    "SELECT path, title, body, published_at FROM site.pages WHERE path = $1",
    [path],
  );
  return rows[0] ?? null;
}

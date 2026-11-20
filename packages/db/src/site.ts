import { getPool } from "./pool";
import { normalisePath } from "./paths";

export type SitePage = { path: string; title: string; body: string; published_at: Date };

/** The site app only ever reads from the site schema. */
export async function findSitePage(rawPath: string): Promise<SitePage | null> {
  const { rows } = await getPool().query<SitePage>(
    "SELECT path, title, body, published_at FROM site.pages WHERE path = $1",
    [normalisePath(rawPath)],
  );
  return rows[0] ?? null;
}

import { getPool } from "./pool";
import { normalisePath, isValidPath } from "./paths";

export type CmsPage = { id: number; path: string; title: string; body: string; updated_at: Date };

export async function listCmsPages(): Promise<CmsPage[]> {
  const { rows } = await getPool().query<CmsPage>(
    "SELECT id, path, title, body, updated_at FROM cms.pages ORDER BY path",
  );
  return rows;
}

/** Create a page, or update it if the path already exists. */
export async function saveCmsPage(input: { path: string; title: string; body: string }): Promise<CmsPage> {
  const path = normalisePath(input.path);
  if (!isValidPath(path)) throw new Error(`Invalid path: ${input.path}`);
  if (!input.title.trim()) throw new Error("Title is required");
  const { rows } = await getPool().query<CmsPage>(
    `INSERT INTO cms.pages (path, title, body) VALUES ($1, $2, $3)
     ON CONFLICT (path) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = now()
     RETURNING id, path, title, body, updated_at`,
    [path, input.title.trim(), input.body],
  );
  return rows[0];
}

export async function deleteCmsPage(id: number): Promise<void> {
  await getPool().query("DELETE FROM cms.pages WHERE id = $1", [id]);
}

export type PublishResult = { published: string[] };

/**
 * Replace the site's published pages with the current CMS pages, atomically.
 * Later this is where the published path list gets pushed to Redis for the filter app.
 */
export async function publishAll(): Promise<PublishResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM site.pages");
    const { rows } = await client.query<{ path: string }>(
      `INSERT INTO site.pages (path, title, body, published_at)
       SELECT path, title, body, now() FROM cms.pages
       RETURNING path`,
    );
    await client.query("COMMIT");
    return { published: rows.map((r) => r.path).sort() };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function publishedCount(): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>("SELECT count(*) FROM site.pages");
  return Number(rows[0].count);
}

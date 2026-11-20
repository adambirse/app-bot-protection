import { getPool } from "./pool";
import { validatePageInput, parseId, ValidationError } from "./validation";

export { ValidationError, LIMITS, type ValidationCode } from "./validation";

export type CmsPage = { id: number; path: string; title: string; body: string; updated_at: Date };

export async function listCmsPages(): Promise<CmsPage[]> {
  const { rows } = await getPool().query<CmsPage>(
    "SELECT id, path, title, body, updated_at FROM cms.pages ORDER BY path",
  );
  return rows;
}

/** Create a page, or update it if the path already exists. Throws ValidationError on bad input. */
export async function saveCmsPage(raw: { path: unknown; title: unknown; body: unknown }): Promise<CmsPage> {
  const input = validatePageInput(raw);
  const { rows } = await getPool().query<CmsPage>(
    `INSERT INTO cms.pages (path, title, body) VALUES ($1, $2, $3)
     ON CONFLICT (path) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = now()
     RETURNING id, path, title, body, updated_at`,
    [input.path, input.title, input.body],
  );
  return rows[0];
}

/** Throws ValidationError if the id is malformed or no such page exists. */
export async function deleteCmsPage(rawId: unknown): Promise<void> {
  const id = parseId(rawId);
  const { rowCount } = await getPool().query("DELETE FROM cms.pages WHERE id = $1", [id]);
  if (rowCount === 0) throw new ValidationError("not_found");
}

// Arbitrary constant identifying the publish lock (pg advisory locks are keyed by bigint).
const PUBLISH_LOCK_KEY = 7_402_115_001;

export type PublishResult = { published: string[]; publishedAt: Date };

/**
 * Replace the site's published pages with the current CMS pages, atomically.
 * Publishes are serialised with a transaction-scoped advisory lock and recorded in
 * cms.publish_log. Later this is where the published path set is pushed to Redis
 * for the filter app.
 */
export async function publishAll(publishedBy: string): Promise<PublishResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [PUBLISH_LOCK_KEY]);
    await client.query("DELETE FROM site.pages");
    const { rows } = await client.query<{ path: string }>(
      `INSERT INTO site.pages (path, title, body, published_at)
       SELECT path, title, body, now() FROM cms.pages
       RETURNING path`,
    );
    const log = await client.query<{ published_at: Date }>(
      "INSERT INTO cms.publish_log (published_by, page_count) VALUES ($1, $2) RETURNING published_at",
      [publishedBy, rows.length],
    );
    await client.query("COMMIT");
    return { published: rows.map((r) => r.path).sort(), publishedAt: log.rows[0].published_at };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export type PublishStatus = { liveCount: number; last: { published_at: Date; published_by: string } | null };

export async function publishStatus(): Promise<PublishStatus> {
  const pool = getPool();
  const [count, last] = await Promise.all([
    pool.query<{ count: string }>("SELECT count(*) FROM site.pages"),
    pool.query<{ published_at: Date; published_by: string }>(
      "SELECT published_at, published_by FROM cms.publish_log ORDER BY id DESC LIMIT 1",
    ),
  ]);
  return { liveCount: Number(count.rows[0].count), last: last.rows[0] ?? null };
}

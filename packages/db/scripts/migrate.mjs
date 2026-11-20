// Applies new SQL files from ../migrations in name order, once each, recording them in
// public.schema_migrations. Each file runs in its own transaction. A previously applied
// file whose contents have changed is an error. Runs as the database owner
// (MIGRATION_DATABASE_URL), never as an app user.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL must be set");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_LOCK_KEY = 7_402_115_000;

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name        text PRIMARY KEY,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query("SELECT name, checksum FROM public.schema_migrations");
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));

  const files = (await readdir(dir)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  let count = 0;
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) throw new Error(`${file} has changed since it was applied`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${err.message}`);
    }
    console.log(`applied ${file}`);
    count++;
  }
  console.log(count ? `${count} migration(s) applied` : "database is up to date");
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

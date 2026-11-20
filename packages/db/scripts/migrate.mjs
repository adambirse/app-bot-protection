// Applies every SQL file in ../migrations in name order. All migrations are idempotent.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const connectionString = process.env.DATABASE_URL ?? "postgres://cms:cms@localhost:5432/cms_prototype";

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(await readFile(path.join(dir, file), "utf8"));
    console.log(`applied ${file}`);
  }
} finally {
  await client.end();
}

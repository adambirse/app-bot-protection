// Runs against a real migrated database with the app users created (pnpm db:setup).
// Skipped when MIGRATION_DATABASE_URL isn't set.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const urlFor = (user: string, password: string | undefined) => {
  const u = new URL(ownerUrl!);
  u.username = user;
  u.password = password ?? "";
  return u.toString();
};

describe.skipIf(!ownerUrl)("database", () => {
  let cms: pg.Client;
  let site: pg.Client;

  beforeAll(async () => {
    process.env.DATABASE_URL = urlFor("cms_user", process.env.CMS_DB_PASSWORD);
    cms = new pg.Client({ connectionString: process.env.DATABASE_URL });
    site = new pg.Client({ connectionString: urlFor("site_user", process.env.SITE_DB_PASSWORD) });
    await Promise.all([cms.connect(), site.connect()]);
  });

  afterAll(async () => {
    await Promise.all([cms?.end(), site?.end()]);
    const { getPool } = await import("./pool");
    await getPool().end();
  });

  const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/permission denied|must be owner/);

  describe("site user", () => {
    it("can read published pages", async () => {
      await expect(site.query("SELECT count(*) FROM site.pages")).resolves.toBeTruthy();
    });
    it("cannot change published pages", async () => {
      await denied(site.query("INSERT INTO site.pages (path, title) VALUES ('/x', 'x')"));
      await denied(site.query("DELETE FROM site.pages"));
      await denied(site.query("UPDATE site.pages SET title = 'x'"));
    });
    it("cannot read CMS tables", async () => {
      await denied(site.query("SELECT * FROM cms.pages"));
      await denied(site.query("SELECT * FROM cms.publish_log"));
    });
    it("cannot create objects", async () => {
      await denied(site.query("CREATE TABLE site.evil (id int)"));
      await denied(site.query("CREATE TABLE public.evil (id int)"));
    });
  });

  describe("cms user", () => {
    it("cannot change the schema or rewrite the audit log", async () => {
      await denied(cms.query("CREATE TABLE cms.evil (id int)"));
      await denied(cms.query("DROP TABLE site.pages"));
      await denied(cms.query("ALTER TABLE cms.pages DROP CONSTRAINT cms_pages_body_length"));
      await denied(cms.query("DELETE FROM cms.publish_log"));
      await denied(cms.query("UPDATE cms.publish_log SET published_by = 'x'"));
      await denied(cms.query("SELECT * FROM public.schema_migrations"));
    });

    it("database constraints back up the app's limits", async () => {
      await expect(cms.query("INSERT INTO cms.pages (path, title) VALUES ('/Bad Path', 'x')")).rejects.toThrow(
        /cms_pages_path_format/,
      );
      await expect(
        cms.query("INSERT INTO cms.pages (path, title, body) VALUES ('/ok-db-test', 'x', repeat('b', 10001))"),
      ).rejects.toThrow(/cms_pages_body_length/);
    });
  });

  describe("publishAll", () => {
    it("serialises concurrent publishes and records each one", async () => {
      const { publishAll, saveCmsPage } = await import("./cms");
      await saveCmsPage({ path: `/it-${Date.now().toString(36)}`, title: "Integration", body: "" });
      const before = Number((await cms.query("SELECT count(*) FROM cms.publish_log")).rows[0].count);

      const results = await Promise.all([publishAll("it-a"), publishAll("it-b"), publishAll("it-c")]);

      const after = Number((await cms.query("SELECT count(*) FROM cms.publish_log")).rows[0].count);
      expect(after - before).toBe(3);
      const cmsCount = Number((await cms.query("SELECT count(*) FROM cms.pages")).rows[0].count);
      const siteCount = Number((await cms.query("SELECT count(*) FROM site.pages")).rows[0].count);
      expect(siteCount).toBe(cmsCount);
      for (const r of results) expect(r.published.length).toBe(cmsCount);
    });
  });
});

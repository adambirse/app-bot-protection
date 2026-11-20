import pg from "pg";

const globalForPool = globalThis as unknown as { __cmsBotPool?: pg.Pool };

/** One pool per process (survives Next.js dev hot reloads). */
export function getPool(): pg.Pool {
  if (!globalForPool.__cmsBotPool) {
    globalForPool.__cmsBotPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://cms:cms@localhost:5432/cms_prototype",
      max: 5,
    });
  }
  return globalForPool.__cmsBotPool;
}

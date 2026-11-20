import pg from "pg";

const globalForPool = globalThis as unknown as { __cmsBotPool?: pg.Pool };

/** One pool per process (survives Next.js dev hot reloads). DATABASE_URL is required. */
export function getPool(): pg.Pool {
  if (!globalForPool.__cmsBotPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL must be set");
    globalForPool.__cmsBotPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
    });
  }
  return globalForPool.__cmsBotPool;
}

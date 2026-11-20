import { createClient } from "@redis/client";

function connect(url: string) {
  const client = createClient({
    url,
    // Commands fail straight away while disconnected instead of queueing, so the
    // filter can fail open rather than hang.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: (retries: number) => Math.min(retries * 200, 2_000),
    },
  });
  client.on("error", (err: Error) => console.error(`[redis] ${err.message}`));
  return client;
}

export type RedisClient = ReturnType<typeof connect>;

const globalForRedis = globalThis as unknown as { __cmsBotRedis?: Promise<RedisClient> };

/** One shared connection per process, created on first use. */
export function getRedis(url = process.env.REDIS_URL): Promise<RedisClient> {
  if (!url) return Promise.reject(new Error("REDIS_URL must be set"));
  let pending = globalForRedis.__cmsBotRedis;
  if (!pending) {
    const client = connect(url);
    pending = client.connect().catch((err: unknown) => {
      globalForRedis.__cmsBotRedis = undefined;
      client.destroy();
      throw err;
    }) as Promise<RedisClient>;
    globalForRedis.__cmsBotRedis = pending;
  }
  return pending;
}

/** Reject if `p` takes longer than `ms`. Used to bound every lookup on the request path. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

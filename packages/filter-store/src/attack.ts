/**
 * Demo traffic generator: a burst of bot-like requests (scanner paths and random
 * enumeration) mixed with a few real pages. Used by the dashboard's attack buttons;
 * scripts/attack.mjs is the command-line equivalent.
 */
export const SCANNER_PATHS = [
  "/wp-admin",
  "/wp-login.php",
  "/.env",
  "/.git/config",
  "/phpmyadmin",
  "/admin",
  "/xmlrpc.php",
  "/config.json",
  "/backup.zip",
  "/server-status",
  "/api/v1/users",
  "/cgi-bin/test.cgi",
];

export function attackPaths(realPaths: readonly string[], count: number, random = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = random();
    if (realPaths.length > 0 && r < 0.2) out.push(realPaths[Math.floor(random() * realPaths.length)]);
    else if (r < 0.55) out.push(SCANNER_PATHS[Math.floor(random() * SCANNER_PATHS.length)]);
    else out.push(`/${random().toString(36).slice(2, 10)}/${random().toString(36).slice(2, 8)}`);
  }
  return out;
}

export type AttackResult = { sent: number; reachedSite: number; blocked: number; failed: number; durationMs: number };

/**
 * Fire the requests with limited concurrency. A response the filter blocked or
 * rejected, or that the hosting firewall stopped, never reached the site; anything
 * else did.
 */
export async function runAttack(
  baseUrl: string,
  paths: readonly string[],
  { concurrency = 10, timeoutMs = 5_000 }: { concurrency?: number; timeoutMs?: number } = {},
): Promise<AttackResult> {
  const started = Date.now();
  let next = 0;
  let reachedSite = 0;
  let blocked = 0;
  let failed = 0;
  async function worker() {
    while (next < paths.length) {
      const path = paths[next++];
      try {
        const res = await fetch(new URL(path, baseUrl), {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": "cms-bot-demo-attack/1.0" },
        });
        await res.body?.cancel();
        const verdict = res.headers.get("x-filter");
        // Stopped by the filter, or by the hosting firewall in front of a locked site.
        const stopped = verdict === "blocked" || verdict === "rejected" || res.headers.has("x-vercel-mitigated");
        if (stopped) blocked++;
        else reachedSite++;
      } catch {
        failed++; // timeout or network error: no answer from either
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
  return { sent: paths.length, reachedSite, blocked, failed, durationMs: Date.now() - started };
}

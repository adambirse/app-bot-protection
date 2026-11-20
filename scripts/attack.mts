// Command-line demo attack: `pnpm demo:attack [--target filter|site] [--count 200]`.
// Sends bot-like traffic and reports how much reached the site. The CMS's Bot filter
// page shows the same numbers live.
import { parseArgs } from "node:util";
import {
  attackPaths,
  getRedis,
  runAttack,
  saveLastAttack,
  samplePublishedPaths,
  withTimeout,
} from "@cms-bot/filter-store";

const { values } = parseArgs({
  options: {
    target: { type: "string", default: "filter" },
    count: { type: "string", default: "200" },
    concurrency: { type: "string", default: "10" },
  },
});

const target = values.target;
if (target !== "filter" && target !== "site") throw new Error("--target must be filter or site");
const count = Number(values.count);
const concurrency = Number(values.concurrency);
if (!Number.isInteger(count) || count < 1 || count > 100_000) throw new Error("--count must be 1-100000");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) throw new Error("--concurrency must be 1-200");

const baseUrl =
  target === "filter" ? (process.env.FILTER_URL ?? "http://localhost:3002") : (process.env.SITE_URL ?? "http://localhost:3001");

// Mix in some real pages if Redis is reachable; the attack works without it.
let realPaths: string[] = [];
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
try {
  realPaths = await withTimeout(samplePublishedPaths(20, () => getRedis(redisUrl)), 1_000);
} catch {
  console.warn("Redis not reachable: sending only bot paths.");
}

console.log(`Sending ${count} bot-like requests to ${baseUrl} ...`);
const result = await runAttack(baseUrl, attackPaths(realPaths, count), { concurrency });
console.log(
  `Sent ${result.sent}: ${result.reachedSite} reached the site, ${result.blocked} blocked by the filter ` +
    `(${(result.durationMs / 1000).toFixed(1)}s).`,
);
if (result.failed > 0) console.warn(`${result.failed} request(s) got no answer. Is ${baseUrl} running?`);

try {
  await withTimeout(saveLastAttack({ target, at: new Date().toISOString(), ...result }, () => getRedis(redisUrl)), 1_000);
} catch {
  // The dashboard just won't show this run.
}
process.exit(0);

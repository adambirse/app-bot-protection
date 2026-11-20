// A misconfigured app refuses to start rather than running with auth off or no database.
import { assertStartupConfig } from "@cms-bot/security";

try {
  assertStartupConfig();
} catch (err) {
  console.error(`[startup] ${(err as Error).message}`);
  process.exit(1);
}

import "server-only";
import { headers } from "next/headers";
import { checkBasicAuth, loadAuthConfig } from "@cms-bot/security";

/**
 * Re-check basic auth inside the app, not just in the proxy, so a request that
 * somehow skips the proxy still can't read or change data. Returns the user name.
 */
export async function requireUser(): Promise<string> {
  const result = checkBasicAuth((await headers()).get("authorization"), loadAuthConfig());
  if (!result.ok) throw new Error("Unauthorized");
  return result.user;
}

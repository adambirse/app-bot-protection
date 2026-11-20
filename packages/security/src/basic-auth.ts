import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthConfig } from "./config";

export type AuthResult = { ok: true; user: string } | { ok: false };

export const LOCAL_DEV_USER = "local-dev";

// Comparing fixed-length digests keeps the comparison constant-time even when
// the supplied value has a different length from the expected one.
function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

export function checkBasicAuth(authorization: string | null | undefined, config: AuthConfig): AuthResult {
  if (config.mode === "disabled") return { ok: true, user: LOCAL_DEV_USER };
  if (!authorization || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)) return { ok: false };

  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep < 0) return { ok: false };
  const user = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  // Evaluate both so timing doesn't reveal which half was wrong.
  const userOk = safeEqual(user, config.user);
  const passwordOk = safeEqual(password, config.password);
  return userOk && passwordOk ? { ok: true, user } : { ok: false };
}

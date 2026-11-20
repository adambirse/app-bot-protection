/**
 * HTTP Basic auth check shared by both apps. Credentials come from
 * BASIC_AUTH_USER / BASIC_AUTH_PASSWORD. If either is unset, auth is off
 * (handy locally); set both in every deployed environment.
 */
export function checkBasicAuth(authorization: string | null): "ok" | "challenge" {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return "ok";
  if (!authorization?.startsWith("Basic ")) return "challenge";
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return "challenge";
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return "challenge";
  return safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)
    ? "ok"
    : "challenge";
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function challengeResponse(realm: string): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"` },
  });
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const MIN_PASSWORD_LENGTH = 9;

export type AuthConfig = { mode: "enabled"; user: string; password: string } | { mode: "disabled" };

type Env = Record<string, string | undefined>;

/**
 * Basic auth is required. The only way to turn it off is BASIC_AUTH_DISABLED=true,
 * and that is refused when NODE_ENV is "production" (which includes `next start`
 * and every Vercel deployment).
 */
export function loadAuthConfig(env: Env = process.env): AuthConfig {
  if (env.BASIC_AUTH_DISABLED === "true") {
    if (env.NODE_ENV === "production") {
      throw new ConfigError("BASIC_AUTH_DISABLED is not allowed when NODE_ENV=production");
    }
    return { mode: "disabled" };
  }
  const user = env.BASIC_AUTH_USER ?? "";
  const password = env.BASIC_AUTH_PASSWORD ?? "";
  if (!user || !password) {
    throw new ConfigError("BASIC_AUTH_USER and BASIC_AUTH_PASSWORD must both be set");
  }
  if (user.includes(":")) throw new ConfigError("BASIC_AUTH_USER must not contain ':'");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConfigError(`BASIC_AUTH_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { mode: "enabled", user, password };
}

export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name];
  if (!value) throw new ConfigError(`${name} must be set`);
  return value;
}

/** Called from each app's instrumentation hook so a misconfigured app fails at startup. */
export function assertStartupConfig(env: Env = process.env): void {
  loadAuthConfig(env);
  requireEnv("DATABASE_URL", env);
}

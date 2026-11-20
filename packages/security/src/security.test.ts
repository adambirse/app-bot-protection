import { describe, it, expect } from "vitest";
import { loadAuthConfig, assertStartupConfig, ConfigError } from "./config";
import { checkBasicAuth } from "./basic-auth";
import { contentSecurityPolicy, securityHeaders } from "./headers";
import { runSecurityProxy } from "./proxy";

const basic = (s: string) => "Basic " + Buffer.from(s).toString("base64");
const good = { BASIC_AUTH_USER: "admin", BASIC_AUTH_PASSWORD: "correct-horse-battery" };

describe("loadAuthConfig", () => {
  it("fails closed when credentials are missing", () => {
    expect(() => loadAuthConfig({})).toThrow(ConfigError);
    expect(() => loadAuthConfig({ BASIC_AUTH_USER: "admin" })).toThrow(ConfigError);
    expect(() => loadAuthConfig({ BASIC_AUTH_PASSWORD: "correct-horse-battery" })).toThrow(ConfigError);
  });

  it("rejects short passwords and user names containing ':'", () => {
    expect(() => loadAuthConfig({ BASIC_AUTH_USER: "admin", BASIC_AUTH_PASSWORD: "8chars!!" })).toThrow(/9 characters/);
    expect(loadAuthConfig({ BASIC_AUTH_USER: "admin", BASIC_AUTH_PASSWORD: "9 chars!?" }).mode).toBe("enabled");
    expect(() => loadAuthConfig({ ...good, BASIC_AUTH_USER: "a:b" })).toThrow(/':'/);
  });

  it("only allows disabling auth outside production", () => {
    expect(loadAuthConfig({ BASIC_AUTH_DISABLED: "true", NODE_ENV: "development" })).toEqual({ mode: "disabled" });
    expect(() => loadAuthConfig({ BASIC_AUTH_DISABLED: "true", NODE_ENV: "production" })).toThrow(ConfigError);
  });

  it("startup check also requires DATABASE_URL", () => {
    expect(() => assertStartupConfig(good)).toThrow(/DATABASE_URL/);
    expect(() => assertStartupConfig({ ...good, DATABASE_URL: "postgres://x" })).not.toThrow();
  });
});

describe("checkBasicAuth", () => {
  const config = loadAuthConfig(good);

  it("accepts the right credentials", () => {
    expect(checkBasicAuth(basic("admin:correct-horse-battery"), config)).toEqual({ ok: true, user: "admin" });
  });

  it.each([
    ["no header", null],
    ["wrong password", basic("admin:wrong")],
    ["wrong user", basic("root:correct-horse-battery")],
    ["password prefix", basic("admin:correct-horse")],
    ["no separator", basic("admincorrect-horse-battery")],
    ["not basic", "Bearer abc"],
    ["invalid base64", "Basic !!!"],
    ["empty", "Basic "],
  ])("rejects %s", (_name, header) => {
    expect(checkBasicAuth(header, config).ok).toBe(false);
  });

  it("allows passwords containing ':'", () => {
    const c = loadAuthConfig({ BASIC_AUTH_USER: "admin", BASIC_AUTH_PASSWORD: "pass:with:colons" });
    expect(checkBasicAuth(basic("admin:pass:with:colons"), c).ok).toBe(true);
  });
});

describe("security headers", () => {
  it("production CSP uses a nonce and no unsafe sources", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe");
  });

  it("sets the standard hardening headers", () => {
    const h = securityHeaders("x");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });
});

describe("runSecurityProxy", () => {
  const config = loadAuthConfig(good);

  it("returns 500 with security headers when misconfigured", () => {
    const d = runSecurityProxy(new Request("http://x/"), "Test", new ConfigError("missing"));
    expect(d.kind).toBe("respond");
    if (d.kind === "respond") {
      expect(d.response.status).toBe(500);
      expect(d.response.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("challenges unauthenticated requests, with security headers", () => {
    const d = runSecurityProxy(new Request("http://x/"), "Test", config);
    expect(d.kind).toBe("respond");
    if (d.kind === "respond") {
      expect(d.response.status).toBe(401);
      expect(d.response.headers.get("www-authenticate")).toBe('Basic realm="Test", charset="UTF-8"');
      expect(d.response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    }
  });

  it("passes authenticated requests through with a fresh nonce", () => {
    const req = () => new Request("http://x/", { headers: { authorization: basic("admin:correct-horse-battery") } });
    const a = runSecurityProxy(req(), "Test", config);
    const b = runSecurityProxy(req(), "Test", config);
    expect(a.kind).toBe("continue");
    if (a.kind === "continue" && b.kind === "continue") {
      expect(a.requestHeaders.get("content-security-policy")).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
      expect(a.requestHeaders.get("content-security-policy")).not.toBe(b.requestHeaders.get("content-security-policy"));
    }
  });
});

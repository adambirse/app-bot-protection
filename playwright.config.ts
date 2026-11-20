import { defineConfig } from "@playwright/test";

// Test-only settings. Defaults match .env.example so `pnpm test:e2e` works after `pnpm db:setup`.
const dbHost = process.env.E2E_DB_HOST ?? "localhost:5432/cms_prototype";
const dbUrl = (user: string, password: string) =>
  `postgres://${user}:${encodeURIComponent(password)}@${dbHost}`;

export const CMS = { url: "http://localhost:3000", username: "cms-admin", password: "cms-e2e-password" };
export const SITE = { url: "http://localhost:3001", username: "site-user", password: "site-e2e-password" };

// Apps run as production builds (`pnpm build` first). Set E2E_DEV=1 to use `next dev` instead.
const mode = process.env.E2E_DEV ? "dev" : "start";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1, // publishing replaces the whole site, so tests share state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "off" },
  webServer: [
    {
      command: `pnpm --filter @cms-bot/cms ${mode}`,
      url: CMS.url, // a 401 still counts as "up"
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: dbUrl("cms_user", process.env.CMS_DB_PASSWORD ?? "local-cms-password"),
        BASIC_AUTH_USER: CMS.username,
        BASIC_AUTH_PASSWORD: CMS.password,
      },
    },
    {
      command: `pnpm --filter @cms-bot/site ${mode}`,
      url: SITE.url,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: dbUrl("site_user", process.env.SITE_DB_PASSWORD ?? "local-site-password"),
        BASIC_AUTH_USER: SITE.username,
        BASIC_AUTH_PASSWORD: SITE.password,
      },
    },
  ],
});

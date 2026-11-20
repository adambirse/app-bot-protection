import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { CMS, FILTER, SITE } from "../playwright.config";
import { createPage, failOnCspViolations, openApp, publish } from "./helpers";

failOnCspViolations();

const run = `f${Date.now().toString(36)}`;

// Visitors reach the site through the filter, so they still need the site's credentials.
async function visitor(playwright: typeof import("@playwright/test")["request"]): Promise<APIRequestContext> {
  return playwright.newContext({
    baseURL: FILTER.url,
    httpCredentials: { username: SITE.username, password: SITE.password, send: "always" },
  });
}

async function dashboard(cms: Page) {
  await cms.goto("/filter");
  await expect(cms.getByTestId("live-stats")).toBeVisible();
}

async function setFilterOn(cms: Page, on: boolean) {
  await dashboard(cms);
  const button = cms.getByRole("button", { name: on ? "Switch filter on" : "Switch filter off" });
  if (await button.isVisible()) {
    await button.click();
    await expect(cms.getByRole("main").getByRole("status")).toHaveText(on ? /switched on/ : /switched off/);
  }
}

test.describe("bot filter", () => {
  test("lets published pages through and blocks everything else before the site", async ({ browser, playwright }) => {
    const cms = await openApp(browser, CMS);
    await setFilterOn(cms, true);
    await dashboard(cms);
    await cms.getByRole("button", { name: "Reset counters" }).click();
    await expect(cms.getByRole("main").getByRole("status")).toHaveText("Counters reset.");
    // A brand-new Redis has no path list yet, and the filter fails open until it gets one.
    await cms.getByRole("button", { name: "Resync pages" }).click();
    await expect(cms.getByRole("main").getByRole("status")).toHaveText(/now matches the live site/);

    const path = `/${run}/welcome`;
    await createPage(cms, path, "Welcome");
    const api = await visitor(playwright.request);

    // Not published yet: the filter answers itself.
    const early = await api.get(path);
    expect(early.status()).toBe(404);
    expect(early.headers()["x-filter"]).toBe("blocked");

    await publish(cms);

    // The filter drops its cached answer within about a second of a publish.
    await expect.poll(async () => (await api.get(path)).headers()["x-filter"], { timeout: 10_000 }).toBe("allowed");
    const ok = await api.get(path);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toContain(path);
    expect(Number(ok.headers()["x-filter-ms"])).toBeLessThan(150);

    for (const probe of ["/wp-admin", "/.env", `/${run}/nope`, "/%E0%A4%A"]) {
      const res = await api.get(probe);
      expect(res.status(), probe).toBe(404);
      expect(res.headers()["x-filter"], probe).toBe("blocked");
      expect(await res.text()).toBe("Not found\n");
    }

    // The dashboard shows the traffic live (it polls every two seconds).
    await dashboard(cms);
    await expect(cms.getByTestId("count-blocked")).not.toHaveText("0", { timeout: 10_000 });
    await expect(cms.getByTestId("count-forwarded")).not.toHaveText("0");
    await expect(cms.getByTestId("filter-paths")).not.toHaveClass(/error/);
    await expect(cms.getByRole("img", { name: /Requests per minute/ })).toBeVisible();
    await api.dispose();
  });

  test("a client can't forge the origin secret, and the site's own 404s come back unchanged when switched off", async ({ browser, playwright }) => {
    const cms = await openApp(browser, CMS);
    const api = await visitor(playwright.request);

    await setFilterOn(cms, false);
    await expect(cms.getByTestId("filter-mode")).toHaveText(/Filter is OFF/);
    await expect
      .poll(async () => (await api.get(`/${run}/unknown`)).headers()["x-filter"], { timeout: 10_000 })
      .toBe("passthrough");
    const res = await api.get(`/${run}/unknown`, { headers: { "x-filter-secret": "forged" } });
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain("Page not found"); // rendered by the site, not the filter

    await setFilterOn(cms, true);
    await expect(cms.getByTestId("filter-mode")).toHaveText(/Filter is ON/);
    await expect
      .poll(async () => (await api.get(`/${run}/unknown`)).headers()["x-filter"], { timeout: 10_000 })
      .toBe("blocked");
    await api.dispose();
  });

  test("the demo attack shows bots reaching the site directly but not through the filter", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await setFilterOn(cms, true);

    await dashboard(cms);
    await cms.getByRole("button", { name: "Attack the site directly" }).click();
    await expect(cms.getByRole("main").getByRole("status")).toHaveText(/Demo attack finished/);
    await expect(cms.getByTestId("last-attack")).toContainText("straight at the site");
    await expect(cms.getByTestId("last-attack")).toContainText("200 reached the site");

    await cms.getByRole("button", { name: "Attack through the filter" }).click();
    await expect(cms.getByTestId("last-attack")).toContainText("through the filter", { timeout: 30_000 });
    const text = await cms.getByTestId("last-attack").innerText();
    const blocked = Number(/(\d+) blocked/.exec(text)?.[1]);
    const reached = Number(/(\d+) reached the site/.exec(text)?.[1]);
    expect(blocked).toBeGreaterThan(100);
    expect(reached + blocked).toBe(200);
  });

  test("resync makes the filter match the live site", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await dashboard(cms);
    await cms.getByRole("button", { name: "Resync pages" }).click();
    await expect(cms.getByRole("main").getByRole("status")).toHaveText(/now matches the live site/);
    await expect(cms.getByTestId("filter-paths")).not.toHaveClass(/error/);
  });
});

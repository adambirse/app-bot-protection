import { test, expect, type Browser, type Page } from "@playwright/test";
import { CMS, SITE } from "../playwright.config";

// Unique per run so reruns against the same database don't collide.
const run = Date.now().toString(36);

async function openApp(browser: Browser, app: typeof CMS): Promise<Page> {
  const context = await browser.newContext({
    baseURL: app.url,
    httpCredentials: { username: app.username, password: app.password },
  });
  return context.newPage();
}

async function createPage(cms: Page, path: string, title: string, body = "") {
  await cms.goto("/");
  await cms.getByLabel("Path").fill(path);
  await cms.getByLabel("Title").fill(title);
  await cms.getByLabel("Body").fill(body);
  await cms.getByRole("button", { name: "Save page" }).click();
  await expect(cms.getByRole("status")).toHaveText("Page saved.");
}

async function publish(cms: Page) {
  await cms.goto("/");
  await cms.getByRole("button", { name: "Publish" }).click();
  await expect(cms.getByRole("status")).toContainText("Published");
}

test.describe("basic auth", () => {
  for (const app of [CMS, SITE]) {
    test(`${app.url} rejects requests without credentials`, async ({ request }) => {
      const res = await request.get(app.url + "/");
      expect(res.status()).toBe(401);
      expect(res.headers()["www-authenticate"]).toContain("Basic");
    });

    test(`${app.url} rejects wrong credentials`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({
        httpCredentials: { username: app.username, password: "wrong" },
      });
      expect((await ctx.get(app.url + "/")).status()).toBe(401);
      await ctx.dispose();
    });
  }
});

test.describe("create, publish, serve", () => {
  const about = `/e2e-${run}/about`;
  const team = `/e2e-${run}/about/team`;

  test("published pages are served, unknown paths get the error page", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    const site = await openApp(browser, SITE);

    await createPage(cms, about, "About us", "Who we are.");
    // Saved without a leading slash and with a trailing one: the CMS normalises it.
    await createPage(cms, `${team.slice(1)}/`, "Our team");
    await expect(cms.getByTestId("pages")).toContainText(team);

    // Not published yet, so the site doesn't know about it.
    let res = await site.goto(about);
    expect(res?.status()).toBe(404);

    await publish(cms);

    res = await site.goto(about);
    expect(res?.status()).toBe(200);
    await expect(site.getByTestId("served-path")).toHaveText(about);
    await expect(site.getByRole("heading", { level: 1 })).toHaveText("About us");
    await expect(site.getByText("Who we are.")).toBeVisible();

    res = await site.goto(team + "/");
    expect(res?.status()).toBe(200);
    await expect(site.getByTestId("served-path")).toHaveText(team);

    res = await site.goto(`/e2e-${run}/does-not-exist`);
    expect(res?.status()).toBe(404);
    await expect(site.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("a page created after publishing stays hidden until the next publish", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    const site = await openApp(browser, SITE);
    const later = `/e2e-${run}/later`;

    await createPage(cms, later, "Later page");
    expect((await site.goto(later))?.status()).toBe(404);

    await publish(cms);
    expect((await site.goto(later))?.status()).toBe(200);
    await expect(site.getByTestId("served-path")).toHaveText(later);
  });
});

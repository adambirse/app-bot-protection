import { test, expect, type Browser, type Page } from "@playwright/test";
import { CMS, SITE } from "../playwright.config";

// Unique per run so reruns against the same database don't collide.
const run = Date.now().toString(36);

async function openApp(browser: Browser, app: typeof CMS): Promise<Page> {
  const context = await browser.newContext({
    baseURL: app.url,
    httpCredentials: { username: app.username, password: app.password },
  });
  const page = await context.newPage();
  // Any CSP violation means the policy is breaking the app (or something unexpected ran).
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
  });
  return page;
}

const cspErrors: string[] = [];
test.afterEach(() => {
  expect(cspErrors, "CSP violations").toEqual([]);
  cspErrors.length = 0;
});

async function createPage(cms: Page, path: string, title: string, body = "") {
  await cms.goto("/");
  await cms.getByLabel("Path").fill(path);
  await cms.getByLabel("Title").fill(title);
  await cms.getByLabel("Body").fill(body);
  await cms.getByRole("button", { name: "Save page" }).click();
  await expect(cms.getByRole("main").getByRole("status")).toHaveText("Page saved.");
  await expect(cms.getByRole("main").getByRole("alert")).toHaveCount(0);
}

async function publish(cms: Page) {
  await cms.goto("/");
  await cms.getByRole("button", { name: "Publish" }).click();
  await expect(cms.getByRole("main").getByRole("status")).toHaveText("Site published.");
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

test.describe("hardening", () => {
  test("malformed and hostile URLs get a 404, not a server error", async ({ browser }) => {
    const site = await openApp(browser, SITE);
    for (const path of ["/%E0%A4%A", "/%", "/a%2Fb", "/%2E%2E/etc", "/%27%20OR%201%3D1--", "/" + "a".repeat(400)]) {
      const res = await site.request.get(path);
      expect(res.status(), path).toBe(404);
    }
  });

  test("both apps send security headers on every response", async ({ browser, request }) => {
    for (const app of [CMS, SITE]) {
      const page = await openApp(browser, app);
      for (const res of [await page.request.get("/"), await page.request.get("/no-such-page"), await request.get(app.url)]) {
        const h = res.headers();
        expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
        expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
        expect(h["x-frame-options"]).toBe("DENY");
        expect(h["x-content-type-options"]).toBe("nosniff");
        expect(h["strict-transport-security"]).toContain("max-age=");
        expect(h["x-powered-by"]).toBeUndefined();
      }
    }
  });

  test("the CMS never displays text taken from the URL", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await cms.goto("/?error=" + encodeURIComponent("Your session expired, call 0800 000 000") + "&status=hacked");
    await expect(cms.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(cms.getByRole("main").getByRole("status")).toHaveCount(0);
    await expect(cms.getByText("0800 000 000")).toHaveCount(0);
  });

  test("over-long and invalid input is rejected with a fixed message", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await cms.goto("/");
    // Bypass the browser's maxlength to prove the server enforces the limit too.
    await cms.locator("input[name=title]").evaluate((el) => el.removeAttribute("maxlength"));
    await cms.getByLabel("Path").fill(`/e2e-${run}/long`);
    await cms.getByLabel("Title").fill("t".repeat(201));
    await cms.getByRole("button", { name: "Save page" }).click();
    await expect(cms.getByRole("main").getByRole("alert")).toHaveText("Title must be at most 200 characters.");

    await cms.getByLabel("Path").fill("/not a valid path");
    await cms.getByLabel("Title").fill("Bad path");
    await cms.getByRole("button", { name: "Save page" }).click();
    await expect(cms.getByRole("main").getByRole("alert")).toContainText("Path can only contain");
  });

  test("deleting with a tampered id is rejected cleanly", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await createPage(cms, `/e2e-${run}/tamper`, "Tamper target");
    const deleteButton = cms.getByRole("button", { name: `Delete /e2e-${run}/tamper` });

    for (const bad of ["1 OR 1=1", "abc", "-1"]) {
      await cms.goto("/");
      await deleteButton.locator("xpath=..").locator("input[name=id]").evaluate((el, v) => {
        (el as HTMLInputElement).value = v;
      }, bad);
      await deleteButton.click();
      await expect(cms).toHaveURL(/error=invalid_id/);
      await expect(cms.getByRole("main").getByRole("alert")).toHaveText("That page reference is not valid.");
    }
    await expect(cms.getByTestId("pages")).toContainText(`/e2e-${run}/tamper`);

    await cms.goto("/");
    await deleteButton.click();
    await expect(cms).toHaveURL(/status=deleted/);
    await expect(cms.getByRole("main").getByRole("status")).toHaveText("Page deleted.");
    await expect(cms.getByTestId("pages")).not.toContainText(`/e2e-${run}/tamper`);
  });

  test("publishing records who published", async ({ browser }) => {
    const cms = await openApp(browser, CMS);
    await publish(cms);
    await expect(cms.getByTestId("publish-status")).toContainText(`by ${CMS.username}`);
  });
});

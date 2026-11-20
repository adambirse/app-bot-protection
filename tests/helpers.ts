import { test, expect, type Browser, type Page } from "@playwright/test";
import type { CMS } from "../playwright.config";

const cspErrors: string[] = [];

/** Call at the top of a spec file: any CSP violation means the policy is breaking the app. */
export function failOnCspViolations() {
  test.afterEach(() => {
    expect(cspErrors, "CSP violations").toEqual([]);
    cspErrors.length = 0;
  });
}

export async function openApp(browser: Browser, app: Pick<typeof CMS, "url" | "username" | "password">): Promise<Page> {
  const context = await browser.newContext({
    baseURL: app.url,
    httpCredentials: { username: app.username, password: app.password },
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
  });
  return page;
}

export async function createPage(cms: Page, path: string, title: string, body = "") {
  await cms.goto("/");
  await cms.getByLabel("Path").fill(path);
  await cms.getByLabel("Title").fill(title);
  await cms.getByLabel("Body").fill(body);
  await cms.getByRole("button", { name: "Save page" }).click();
  await expect(cms.getByRole("main").getByRole("status")).toHaveText("Page saved.");
  await expect(cms.getByRole("main").getByRole("alert")).toHaveCount(0);
}

export async function publish(cms: Page) {
  await cms.goto("/");
  await cms.getByRole("button", { name: "Publish" }).click();
  await expect(cms.getByRole("main").getByRole("status")).toHaveText("Site published.");
}

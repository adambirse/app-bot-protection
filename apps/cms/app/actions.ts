"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCmsPage, deleteCmsPage, publishAll, ValidationError } from "@cms-bot/db/cms";
import { requireUser } from "../lib/auth";
import { pushPathsToFilter } from "../lib/filter";

// Expected validation failures go back to the form as a fixed code. Anything else is
// rethrown, so Next.js shows its generic error page and the details stay in the logs.
// The action may return a different status code to report (e.g. a partial success).
async function run(action: () => Promise<unknown>, status: string): Promise<never> {
  try {
    const result = await action();
    if (typeof result === "string") status = result;
  } catch (err) {
    if (err instanceof ValidationError) redirect(`/?error=${err.code}`);
    throw err;
  }
  revalidatePath("/");
  redirect(`/?status=${status}`);
}

export async function savePage(formData: FormData) {
  await requireUser();
  await run(
    () => saveCmsPage({ path: formData.get("path"), title: formData.get("title"), body: formData.get("body") }),
    "saved",
  );
}

export async function deletePage(formData: FormData) {
  await requireUser();
  await run(() => deleteCmsPage(formData.get("id")), "deleted");
}

export async function publish() {
  const user = await requireUser();
  await run(async () => {
    await publishAll(user);
    // The site is already live; a filter update failure is reported, not thrown.
    return (await pushPathsToFilter()) ? "published" : "published_filter_stale";
  }, "published");
}

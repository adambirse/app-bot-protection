"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCmsPage, deleteCmsPage, publishAll, ValidationError } from "@cms-bot/db/cms";
import { requireUser } from "../lib/auth";

// Expected validation failures go back to the form as a fixed code. Anything else is
// rethrown, so Next.js shows its generic error page and the details stay in the logs.
async function run(action: () => Promise<unknown>, status: string): Promise<never> {
  try {
    await action();
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
  await run(() => publishAll(user), "published");
}

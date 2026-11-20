"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCmsPage, deleteCmsPage, publishAll } from "@cms-bot/db/cms";

export async function savePage(formData: FormData) {
  try {
    await saveCmsPage({
      path: String(formData.get("path") ?? ""),
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
  } catch (err) {
    redirect(`/?error=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath("/");
  redirect("/?saved=1");
}

export async function deletePage(formData: FormData) {
  await deleteCmsPage(Number(formData.get("id")));
  revalidatePath("/");
}

export async function publish() {
  const { published } = await publishAll();
  revalidatePath("/");
  redirect(`/?published=${published.length}`);
}

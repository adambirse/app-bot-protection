"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listPublishedPaths } from "@cms-bot/db/cms";
import {
  attackPaths,
  resetStats,
  runAttack,
  saveLastAttack,
  setMode,
  withTimeout,
} from "@cms-bot/filter-store";
import { requireUser } from "../../lib/auth";
import { demoTargets, pushPathsToFilter } from "../../lib/filter";

const REDIS_TIMEOUT_MS = 3_000;
const ATTACK_REQUESTS = 200;

function done(status: string): never {
  revalidatePath("/filter");
  redirect(`/filter?status=${status}`);
}

function fail(error: string): never {
  redirect(`/filter?error=${error}`);
}

export async function setFilterMode(formData: FormData) {
  await requireUser();
  const mode = formData.get("mode");
  if (mode !== "enforce" && mode !== "passthrough") fail("invalid_request");
  try {
    await withTimeout(setMode(mode), REDIS_TIMEOUT_MS);
  } catch {
    fail("redis_unavailable");
  }
  done(`mode_${mode}`);
}

export async function resetFilterStats() {
  await requireUser();
  try {
    await withTimeout(resetStats(), REDIS_TIMEOUT_MS);
  } catch {
    fail("redis_unavailable");
  }
  done("reset");
}

export async function resyncFilter() {
  await requireUser();
  if (!(await pushPathsToFilter())) fail("redis_unavailable");
  done("resynced");
}

/**
 * Send a burst of bot-like requests (scanner paths, random URLs and a few real pages)
 * either through the filter or straight at the site, and record how many reached it.
 * Targets come from configuration only, so this can't be pointed anywhere else.
 */
export async function runDemoAttack(formData: FormData) {
  await requireUser();
  const target = formData.get("target");
  if (target !== "filter" && target !== "site") fail("invalid_request");
  const baseUrl = demoTargets()[target];
  if (!baseUrl) fail("attack_unavailable");

  const result = await runAttack(baseUrl, attackPaths(await listPublishedPaths(), ATTACK_REQUESTS));
  try {
    await withTimeout(saveLastAttack({ target, at: new Date().toISOString(), ...result }), REDIS_TIMEOUT_MS);
  } catch {
    fail("redis_unavailable");
  }
  done("attack_done");
}

import { requireUser } from "../../../lib/auth";
import { loadFilterStats } from "../../../lib/filter";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** Polled by the dashboard for live numbers. Basic auth is checked here as well as in the proxy. */
export async function GET(): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Unauthorized\n", { status: 401, headers: NO_STORE });
  }
  return Response.json(await loadFilterStats(), { headers: NO_STORE });
}

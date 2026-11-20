import Link from "next/link";
import { requireUser } from "../../lib/auth";
import { demoTargets, loadFilterStats } from "../../lib/filter";
import { FILTER_ERROR_MESSAGES, FILTER_STATUS_MESSAGES, lookup } from "../messages";
import { resetFilterStats, resyncFilter, runDemoAttack, setFilterMode } from "./actions";
import { LiveStats } from "./live-stats";

export const dynamic = "force-dynamic";

export default async function FilterDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; status?: string | string[] }>;
}) {
  await requireUser();
  const params = await searchParams;
  const error = lookup(FILTER_ERROR_MESSAGES, typeof params.error === "string" ? params.error : undefined);
  const status = lookup(FILTER_STATUS_MESSAGES, typeof params.status === "string" ? params.status : undefined);
  const stats = await loadFilterStats();
  const targets = demoTargets();

  return (
    <main>
      <nav>
        <Link href="/">Pages</Link> · <strong>Bot filter</strong>
      </nav>
      <h1>Bot filter</h1>
      <p>
        The filter sits in front of the site. It only lets through requests for pages that have been published,
        so bots probing for other URLs never reach the site.
      </p>

      {error && <p role="alert" className="error">{error}</p>}
      {status && <p role="status">{status}</p>}

      <LiveStats initial={stats} />

      {stats.available && (
        <section>
          <h2>Controls</h2>
          <div className="controls">
            <form action={setFilterMode}>
              <input type="hidden" name="mode" value={stats.mode === "enforce" ? "passthrough" : "enforce"} />
              <button type="submit">{stats.mode === "enforce" ? "Switch filter off" : "Switch filter on"}</button>
            </form>
            <form action={resetFilterStats}>
              <button type="submit">Reset counters</button>
            </form>
            <form action={resyncFilter}>
              <button type="submit">Resync pages</button>
            </form>
          </div>
        </section>
      )}

      {stats.available && (targets.filter || targets.site) && (
        <section>
          <h2>Demo attack</h2>
          <p>
            Sends 200 bot-like requests (scanner paths such as /wp-admin and /.env, random URLs, and a few real
            pages) and counts how many reach the site.
          </p>
          <div className="controls">
            {targets.filter && (
              <form action={runDemoAttack}>
                <input type="hidden" name="target" value="filter" />
                <button type="submit">Attack through the filter</button>
              </form>
            )}
            {targets.site && (
              <form action={runDemoAttack}>
                <input type="hidden" name="target" value="site" />
                <button type="submit">Attack the site directly</button>
              </form>
            )}
          </div>
        </section>
      )}

      {targets.filter && (
        <section>
          <h2>Try it yourself</h2>
          <p>
            Open the site through the filter at <a href={targets.filter}>{targets.filter}</a>. Published pages load
            as normal; any other path gets a 404 from the filter. The response header <code>x-filter</code> says
            which (<code>allowed</code> or <code>blocked</code>), and <code>x-filter-ms</code> shows how long the
            check took.
          </p>
        </section>
      )}
    </main>
  );
}

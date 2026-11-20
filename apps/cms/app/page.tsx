import Link from "next/link";
import { listCmsPages, publishStatus, LIMITS } from "@cms-bot/db/cms";
import { requireUser } from "../lib/auth";
import { savePage, deletePage, publish } from "./actions";
import { ERROR_MESSAGES, STATUS_MESSAGES, lookup } from "./messages";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; status?: string | string[] }>;
}) {
  await requireUser();
  const params = await searchParams;
  const error = lookup(ERROR_MESSAGES, typeof params.error === "string" ? params.error : undefined);
  const status = lookup(STATUS_MESSAGES, typeof params.status === "string" ? params.status : undefined);
  const [pages, live] = await Promise.all([listCmsPages(), publishStatus()]);

  return (
    <main>
      <nav>
        <strong>Pages</strong> · <Link href="/filter">Bot filter</Link>
      </nav>
      <h1>CMS</h1>

      {error && <p role="alert" className="error">{error}</p>}
      {status && <p role="status">{status}</p>}

      <section>
        <h2>Create or update a page</h2>
        <form action={savePage} className="page-form">
          <label>
            Path <input name="path" placeholder="/about/team" required maxLength={LIMITS.path} />
          </label>
          <label>
            Title <input name="title" required maxLength={LIMITS.title} />
          </label>
          <label>
            Body <textarea name="body" rows={4} maxLength={LIMITS.body} />
          </label>
          <button type="submit">Save page</button>
        </form>
      </section>

      <section>
        <h2>Pages ({pages.length})</h2>
        {pages.length === 0 ? (
          <p>No pages yet.</p>
        ) : (
          <table data-testid="pages">
            <thead>
              <tr><th align="left">Path</th><th align="left">Title</th><th /></tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.path}</code></td>
                  <td>{p.title}</td>
                  <td>
                    <form action={deletePage}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" aria-label={`Delete ${p.path}`}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Publish</h2>
        <p data-testid="publish-status">
          The live site has {live.liveCount} published page(s).
          {live.last && <> Last published {live.last.published_at.toISOString()} by {live.last.published_by}.</>}
        </p>
        <p>Publishing replaces the live pages with the pages above.</p>
        <form action={publish}>
          <button type="submit">Publish</button>
        </form>
      </section>
    </main>
  );
}

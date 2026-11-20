import { listCmsPages, publishedCount } from "@cms-bot/db/cms";
import { savePage, deletePage, publish } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; published?: string }>;
}) {
  const params = await searchParams;
  const [pages, live] = await Promise.all([listCmsPages(), publishedCount()]);

  return (
    <main>
      <h1>CMS</h1>

      {params.error && <p role="alert" style={{ color: "crimson" }}>{params.error}</p>}
      {params.saved && <p role="status">Page saved.</p>}
      {params.published && <p role="status">Published {params.published} page(s).</p>}

      <section>
        <h2>Create or update a page</h2>
        <form action={savePage} style={{ display: "grid", gap: "0.5rem", maxWidth: 480 }}>
          <label>
            Path <input name="path" placeholder="/about/team" required />
          </label>
          <label>
            Title <input name="title" required />
          </label>
          <label>
            Body <textarea name="body" rows={4} />
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
        <p>The live site currently has {live} published page(s). Publishing replaces them with the pages above.</p>
        <form action={publish}>
          <button type="submit">Publish</button>
        </form>
      </section>
    </main>
  );
}

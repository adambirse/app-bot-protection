import { notFound } from "next/navigation";
import { findSitePage } from "@cms-bot/db/site";

// Every request is looked up live, so a publish shows up straight away.
export const dynamic = "force-dynamic";

export default async function CatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const path = "/" + slug.map(decodeURIComponent).join("/");
  const page = await findSitePage(path);
  if (!page) notFound();

  return (
    <main>
      <p>
        Serving <code data-testid="served-path">{page.path}</code>
      </p>
      <h1>{page.title}</h1>
      {page.body && <p>{page.body}</p>}
    </main>
  );
}

import { notFound } from "next/navigation";
import { findSitePage } from "@cms-bot/db/site";

// Every request is looked up live, so a publish shows up straight away.
export const dynamic = "force-dynamic";

export default async function CatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  // Segments arrive still percent-encoded; findSitePage decodes and validates them once.
  const { slug = [] } = await params;
  const page = await findSitePage(slug);
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

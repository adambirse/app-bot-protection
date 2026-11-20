# CMS bot protection prototype

A minimal CMS and published website, built as the base for testing application-level bot protection.

```
apps/cms     Next.js CMS (port 3000): create pages at any path, then Publish
apps/site    Next.js public site (port 3001): one catch-all route, serves published pages, 404 otherwise
packages/db  Shared Postgres access, split by app (cms.* and site.* schemas) plus migrations
packages/basic-auth  Basic auth check used by both apps' proxy (middleware)
tests        Playwright end-to-end tests
```

## How it works

- **One database, separate tables per app.** The CMS owns `cms.pages`. The site owns `site.pages` and only ever reads from it.
- **Publish** copies every row in `cms.pages` into `site.pages` in one transaction, replacing what was there.
- **The site** has a single `[[...slug]]` route. It normalises the requested path, looks it up in `site.pages`, and renders the page (showing the path being served) or the 404 page.
- **Paths** are normalised the same way everywhere (`packages/db/src/paths.ts`): leading slash, lower case, no trailing slash. So `About/Team/` in the CMS is served at `/about/team`.

## Run locally

Needs Node 22, pnpm 10 and Docker.

```sh
pnpm install
pnpm db:up          # Postgres in docker compose
pnpm db:migrate
pnpm dev            # CMS on http://localhost:3000, site on http://localhost:3001
```

Basic auth is off unless `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are both set. Each app reads its own env, so copy `apps/cms/.env.example` and `apps/site/.env.example` to `.env.local` in each app to set different credentials. `DATABASE_URL` defaults to the docker compose database.

## Tests

```sh
pnpm build
pnpm test:e2e       # starts both apps with test credentials; E2E_DEV=1 uses next dev instead
```

They cover basic auth on both apps, creating pages, publishing, a published URL being served, an unpublished or unknown URL getting the 404 page, and path normalisation. CI (`.github/workflows/ci.yml`) runs the same against a Postgres service container.

## Deploying to Vercel (later)

Create two Vercel projects from this repo, with Root Directory `apps/cms` and `apps/site`. Set `DATABASE_URL`, `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on each. Use a hosted Postgres (for example Neon) and run `pnpm db:migrate` against it once.

## Where bot protection slots in (next stage)

- **Filter app**: a separate app in front of the site, so the site itself doesn't change. It checks the requested path against the set of published paths and rejects unknown paths before they reach the site.
- **Redis**: holds that set of published paths. `publishAll()` in `packages/db/src/cms.ts` is the one place that changes what's published, so it's where the Redis set gets rebuilt. The filter should use `normalisePath()` so its keys match the site's.

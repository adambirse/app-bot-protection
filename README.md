# CMS bot protection prototype

A minimal CMS and published website, built as the base for testing application-level bot protection.

```
apps/cms            Next.js CMS (port 3000): create pages at any path, then Publish
apps/site           Next.js public site (port 3001): one catch-all route, serves published pages, 404 otherwise
packages/db         Postgres access split by app (cms.* and site.* schemas), validation, migrations
packages/security   Basic auth, startup config checks and security headers shared by both apps
tests               Playwright end-to-end tests (unit tests live next to the code as *.test.ts)
```

## How it works

- **One database, separate schemas per app.** The CMS owns `cms.pages` and `cms.publish_log`. The site reads `site.pages`.
- **Publish** copies every row in `cms.pages` into `site.pages` in one transaction, replacing what was there. Publishes are serialised with an advisory lock and recorded in `cms.publish_log` with who published.
- **The site** has a single `[[...slug]]` route. The raw segments are decoded once and validated; anything that can't be a page path gets a 404 without touching the database.
- **Paths** are canonicalised the same way everywhere (`packages/db/src/paths.ts`): leading slash, lower case, no trailing slash, unreserved URL characters only.

## Security model

- **Basic auth is mandatory.** Each app refuses to start unless `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` (at least 12 characters) are set, and the proxy fails closed if they're missing. `BASIC_AUTH_DISABLED=true` turns it off for local development only, and is refused when `NODE_ENV=production`.
- **Defence in depth.** The CMS re-checks credentials inside every page render and server action, not only in the proxy.
- **Least-privilege database users.** Migrations run as the owner. `cms_user` can manage CMS pages, append to the publish log and replace published pages. `site_user` can only `SELECT` from `site.pages`. Neither can change the schema. See `packages/db/migrations/003_app_roles.sql`.
- **Parameterised SQL only.** No query is built from user input. Limits are enforced in the app and by database `CHECK` constraints.
- **Fixed error messages.** User-facing errors are looked up from a fixed table by code; nothing from the URL or from exceptions is displayed.
- **Security headers** on every response, including 401/404/500: nonce-based CSP with `frame-ancestors 'none'`, HSTS, `X-Frame-Options`, `nosniff`, referrer and permissions policies.
- **CI** runs with a read-only token and third-party actions pinned to commit SHAs.

## Run locally

Needs Node 22, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env    # owner connection + app user passwords for local setup
pnpm db:up              # Postgres in docker compose (bound to 127.0.0.1)
pnpm db:setup           # run migrations, create cms_user and site_user
```

Then copy `apps/cms/.env.example` and `apps/site/.env.example` to `.env.local` in each app, set `DATABASE_URL` with that app's user and password, and set basic auth credentials. Then:

```sh
pnpm dev                # CMS on http://localhost:3000, site on http://localhost:3001
```

## Tests

```sh
pnpm test:unit          # unit tests; database tests also run when MIGRATION_DATABASE_URL is set
pnpm build
pnpm test:e2e           # starts both apps with test credentials; E2E_DEV=1 uses next dev instead
```

Coverage includes auth config and credential checks, path decoding and validation, database permissions for each app user, concurrent publishes, the create/publish/serve flow, hostile URLs, tampered form input, size limits, security headers and CSP violations.

## Deploying to Vercel (later)

Create two Vercel projects from this repo, with Root Directory `apps/cms` and `apps/site`. Set `DATABASE_URL` (each app's own user), `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on each. Use a hosted Postgres (for example Neon), run `pnpm db:migrate` against it as the owner, and create the two login users in the provider as members of `cms_app` and `site_app`.

## Where bot protection slots in (next stage)

- **Filter app**: a separate app in front of the site, so the site itself doesn't change. It checks the requested path against the set of published paths and rejects unknown paths before they reach the site.
- **Redis**: holds that set of published paths. `publishAll()` in `packages/db/src/cms.ts` is the one place that changes what's published, so it's where the Redis set gets rebuilt. The filter should use `pathFromSegments()` / `normalisePath()` so its keys match the site's.

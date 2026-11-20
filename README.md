# CMS bot protection prototype

A minimal CMS and published website, built as the base for testing application-level bot protection.

```
apps/cms            Next.js CMS (port 3000): create pages at any path, then Publish
apps/site           Next.js public site (port 3001): one catch-all route, serves published pages, 404 otherwise
apps/filter         Bot filter (port 3002): sits in front of the site and only lets published paths through
packages/db         Postgres access split by app (cms.* and site.* schemas), validation, migrations
packages/filter-store  Redis keys and access for the filter, the CMS dashboard and the demo attack
packages/security   Basic auth, startup config checks and security headers shared by the Next.js apps
tests               Playwright end-to-end tests (unit tests live next to the code as *.test.ts)
```

## How it works

- **One database, separate schemas per app.** The CMS owns `cms.pages` and `cms.publish_log`. The site reads `site.pages`.
- **Publish** copies every row in `cms.pages` into `site.pages` in one transaction, replacing what was there. Publishes are serialised with an advisory lock and recorded in `cms.publish_log` with who published.
- **The site** has a single `[[...slug]]` route. The raw segments are decoded once and validated; anything that can't be a page path gets a 404 without touching the database.
- **Paths** are canonicalised the same way everywhere (`packages/db/src/paths.ts`): leading slash, lower case, no trailing slash, unreserved URL characters only.

## The bot filter

```
visitor ──▶ (Azure Front Door) ──▶ filter ──▶ site        published path: forwarded
                                     │
                                     └──▶ 404 from the filter    anything else: the site never sees it
```

- **What it does.** For each request the filter canonicalises the path exactly as the site does and checks it against the set of published paths in Redis. Published paths are forwarded to the site unchanged; anything else gets a small `404 Not found` from the filter itself. Next.js asset paths (`/_next/static/`, `/_next/image`, `/favicon.ico`, `/robots.txt`) are passed straight through.
- **It is fast.** Answers are cached in memory for a few seconds per path, so most requests (including repeated bot probes) never leave the process. A publish bumps a version key in Redis; each filter instance checks it once a second and drops its cache. Every response carries `x-filter` (`allowed`, `blocked`, `passthrough` or `fail-open`) and `x-filter-ms` (time spent deciding).
- **It fails open.** If Redis is unreachable or slower than `LOOKUP_TIMEOUT_MS` (default 150 ms), or has never received a path list, the request is forwarded and marked `fail-open`. After a failure Redis is skipped for two seconds, so an outage doesn't add a timeout to every request.
- **Publishing keeps it in sync.** After a publish, the CMS replaces the Redis set atomically (build a staging set, then `RENAME`) while holding the same database lock as publishing, so two publishes can't leave Redis with the older list. If Redis is down the publish still succeeds, the CMS says the filter wasn't updated, and the dashboard's **Resync pages** button fixes it.
- **The site doesn't change.** The filter adds `x-filter-secret` to everything it forwards (and strips any copy a client sends). Lock the site so it only accepts requests carrying that header: on Vercel with a Firewall rule, on Azure with an access restriction or Front Door rule. Behind Azure Front Door, set `REQUIRED_FDID` to your Front Door ID and the filter refuses requests that didn't come through your profile.
- **Portable.** The filter is a plain web-standard `fetch` handler (Hono). `src/node-server.ts` runs it as a Node server (local, containers such as Azure Container Apps); `src/index.ts` is the serverless entry that Vercel picks up. It works with any Redis: local, Upstash or Azure Cache for Redis (`rediss://` URLs).

### Showing it to people

Open **Bot filter** in the CMS (`/filter`). It shows live counts of requests that reached the site and requests the filter blocked, a per-minute chart, and whether the filter's page list matches the live site. From there you can:

- **Attack the site directly** and **Attack through the filter**: each sends 200 bot-like requests (scanner paths like `/wp-admin` and `/.env`, random URLs, and a few real pages). Direct, all 200 reach the site; through the filter, only the real pages do.
- **Switch filter off / on**: off, every request goes to the site (`x-filter: passthrough`), so you can show the difference live.
- **Reset counters** before a demo.

The same attack runs from the command line: `pnpm demo:attack` (through the filter) or `pnpm demo:attack --target site`, with `--count` and `--concurrency`. You can also browse the site through the filter at http://localhost:3002 and look at the `x-filter` response headers.

## Security model

- **Basic auth is mandatory.** Each app refuses to start unless `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` (at least 9 characters, any characters allowed) are set, and the proxy fails closed if they're missing. `BASIC_AUTH_DISABLED=true` turns it off for local development only, and is refused when `NODE_ENV=production`.
- **Defence in depth.** The CMS re-checks credentials inside every page render and server action, not only in the proxy.
- **Least-privilege database users.** Migrations run as the owner. `cms_user` can manage CMS pages, append to the publish log and replace published pages. `site_user` can only `SELECT` from `site.pages`. Neither can change the schema. See `packages/db/migrations/003_app_roles.sql`.
- **Parameterised SQL only.** No query is built from user input. Limits are enforced in the app and by database `CHECK` constraints.
- **Fixed error messages.** User-facing errors are looked up from a fixed table by code; nothing from the URL or from exceptions is displayed.
- **Security headers** on every response, including 401/404/500: nonce-based CSP with `frame-ancestors 'none'`, HSTS, `X-Frame-Options`, `nosniff`, referrer and permissions policies.
- **The filter** never echoes request data in its own responses, strips hop-by-hop headers and any client-supplied `x-filter-secret`, only rewrites redirects that point at the site's own origin, and refuses to start with a malformed `SITE_ORIGIN`, a short secret or a non-GUID `REQUIRED_FDID`. The dashboard's demo attack can only target the URLs in the CMS's own configuration.
- **CI** runs with a read-only token and third-party actions pinned to commit SHAs.

## Run locally

Needs Node 22, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env    # owner connection + app user passwords for local setup
pnpm db:up              # Postgres and Redis in docker compose (bound to 127.0.0.1)
pnpm db:setup           # run migrations, create cms_user and site_user
```

Then copy `apps/cms/.env.example`, `apps/site/.env.example` and `apps/filter/.env.example` to `.env.local` in each app. Set `DATABASE_URL` with that app's user and password and set basic auth credentials; the filter's example works as it is. Then:

```sh
pnpm dev                # CMS on :3000, site on :3001, filter on :3002
```

Publish once from the CMS so the filter gets its page list (until then it fails open). Visitors use the filter's address, http://localhost:3002, with the site's basic auth credentials.

## Tests

```sh
pnpm test:unit          # unit tests; database tests run when MIGRATION_DATABASE_URL is set,
                        # Redis tests when REDIS_TEST_URL is set (that database is flushed: use e.g. redis://localhost:6379/14)
pnpm build
pnpm test:e2e           # starts the CMS, site and filter with test credentials (Redis database 1); E2E_DEV=1 uses dev servers
```

Coverage includes auth config and credential checks, path decoding and validation, database permissions for each app user, concurrent publishes, the create/publish/serve flow, hostile URLs, tampered form input, size limits, security headers and CSP violations. For the filter: allow/block decisions, fail open on errors and timeouts, the circuit breaker, Front Door ID checks, header handling when forwarding, cache invalidation on publish, atomic path-set replacement, publish/sync ordering, the dashboard and the demo attack.

## Deploying to Vercel

Create Vercel projects from this repo with Root Directory `apps/cms` and `apps/site`. Set `DATABASE_URL` (each app's own user), `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on each. Use a hosted Postgres (for example Neon), run `pnpm db:migrate` against it as the owner, and create the two login users in the provider as members of `cms_app` and `site_app`.

For the filter, add a third project with Root Directory `apps/filter` and a Redis (for example Upstash from the Vercel Marketplace). Set on the filter: `SITE_ORIGIN` (the site's URL), `REDIS_URL`, `FILTER_ORIGIN_SECRET` (32+ random characters). Set on the CMS: `REDIS_URL`, and optionally `FILTER_URL` and `SITE_URL` for the demo attack buttons. Then add a Firewall rule on the site project that denies requests without the matching `x-filter-secret` header.

### Hardening for production

The shared secret header is a simple way to lock the site to the filter, and it is fine for this prototype. For a production deployment, consider one or more of:

- **Short-lived signed requests** instead of a fixed secret: the filter signs each forwarded request (for example an HMAC over the path and a timestamp) and the site's edge verifies it.
- **Network-level isolation**, so the site only accepts traffic from the filter's network (on Azure, Private Link or VNet access restrictions behind Front Door).
- **Mutual TLS** between the filter and the site.
- **Rotating** whatever credential is used, and keeping it in a secret store rather than plain configuration.

### Filter settings

| Variable | Required | Meaning |
|---|---|---|
| `SITE_ORIGIN` | yes | Where allowed requests go, e.g. `https://site.example.com` (https in production) |
| `REDIS_URL` | in production | Published paths, counters, on/off switch. Unset locally: every request fails open |
| `FILTER_ORIGIN_SECRET` | in production | Sent to the site as `x-filter-secret`; at least 32 characters |
| `REQUIRED_FDID` | no | Azure Front Door ID; requests without a matching `X-Azure-FDID` get 403 |
| `LOOKUP_TIMEOUT_MS` | no | How long to wait for Redis before failing open (default 150) |
| `PORT`, `HOST` | no | Node server only (defaults 3002 and 127.0.0.1; use `HOST=0.0.0.0` in a container) |


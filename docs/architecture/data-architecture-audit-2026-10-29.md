# Data architecture audit: Next.js apps (2026-10-29)

Baseline: `origin/main` at `6072c6f63fb`. Next.js 16.4.1, React 19.3.1,
drizzle-orm 0.45.4, drizzle-kit 0.31, `@tanstack/react-query` 5.104,
`@tanstack/react-pacer` 0.24, Better Auth 1.7.11. No Clerk package remains.
Decision record: [data-architecture-adr-2026-10-29.md](data-architecture-adr-2026-10-29.md).

How it was measured: `node scripts/data-architecture-guard.mjs --json` (the same
scanner CI runs; comments and prose are masked; tests, stories, scripts and
migrations are excluded) plus `git grep` for inventory counts. Re-run the guard
to refresh any number here; the ratchet file
`scripts/lib/data-architecture-guard.ratchet.gen.json` carries the live totals.

Not measured: build route types and bundle sizes. A local `next build` of
`apps/web` failed after 8 minutes with `ENOENT … .next/server/app/app/money/page/build-manifest.json`
on a host at 99% disk (13 GB free), and the main-branch CI and Vercel production
deploys use prebuilt artifacts without the route table. Route types below are
derived from source config, which determines them while `cacheComponents` is off.

## Inventory

| Surface | apps/web | Other apps |
|---|---|---|
| Pages / route handlers | 259 / 536 | ovie re-exports web admin trees via `apps/ovie/scripts/routes.mjs` |
| `'use client'` files | 1,515 | docs 11, should-i-make 1 |
| Server-action modules (`'use server'`) | 36 | 0 |
| TanStack Query `useQuery*` / `useMutation` | 86 / 130 sites | 0 |
| `invalidateQueries` / `setQueryData` | 149 / 49 | 0 |
| Pacer imports | 15 files (debounce, throttle, rate-limit only) | 0 |
| `'use cache'` / `cacheTag` / `cacheLife` | **0 / 0 / 0** | 0 |
| `unstable_cache` call sites | 39 | 0 |
| React `cache()` | 23 files | 0 |
| `revalidateTag` / `updateTag` / `revalidatePath` | 55 / 4 / 106 | 0 |
| `dynamic = 'force-dynamic'` / `'force-static'` / `revalidate =` | 151 / 13 / 106 files | ovie 2, console 1 |
| `runtime = 'nodejs'` (the default) | 456 files | 0 |
| SSE / websockets | 0 app-owned streams besides the AI SDK chat stream | 0 |
| DB clients | 1 (`lib/db/client/connection.ts`, Neon WS `Pool`, direct endpoint, max 20) | none |
| `db.transaction` outside `lib/db` | 6 (ESLint `no-db-transaction` already gates new ones) | 0 |

Caching layers in use at once: Next data cache (`unstable_cache`), React
`cache()`, `lib/db/cache.ts` (in-memory LRU + Redis), the Redis public-profile
edge cache, TanStack Query, plus `staleTimes` client router caching. Five server
or client caches for one product, with no single invalidation path.

Cache Components: **off** in every app. `apps/web/next.config.js` defers it to
JOV-7985/JOV-7987. Every route with `force-dynamic` (151) renders fully per
request; there is no partial prerendering anywhere.

## Anti-patterns (guard totals, 2026-10-29)

| Rule | Count | Top offenders | User-visible cost |
|---|---|---|---|
| `revalidate-path` | 106 | `app/app/(shell)/admin/actions.ts` (21), `lib/cache/profile.ts` (18), `dashboard/tasks/task-actions.ts` (15), `dashboard/releases/actions.ts` (10), `dashboard/tour-dates/actions.ts` (8) | A server action that calls `revalidatePath` returns a fresh RSC payload for the current route, so a one-field save re-renders the whole page. Task toggles revalidate three routes per call. |
| `revalidate-path-broad` | 9 | `lib/cache/profile.ts:88` (`revalidatePath('/')`), `admin/actions.ts` (2), `onboarding/actions/index.ts`, `onboarding/actions/update-profile.ts` (`DASHBOARD, 'layout'`) | Layout revalidation re-renders the dashboard shell and every child segment after onboarding field saves. |
| `global-tag-revalidate` | 20 | `api/connectors/suggested-actions/[id]/approve/route.ts` (6), `lib/cache/profile.ts` (4), `dashboard/actions/settings.ts` (2), `switch-profile.ts` (2) | `dashboard-data` tags every user's cached dashboard (`dashboard-data.ts:1346-1375`), so one artist's save evicts every artist's dashboard entry. `profiles-all` does the same for every public profile. `docs/CACHING_DECISIONS.md` claims dashboard reads are request-time; the code caches them per user under one shared tag. |
| `router-refresh` | 55 in 37 files | `lib/queries/useOpportunityInboxMutations.ts` (4), `dashboard-pay/useDashboardPay.ts` (2, after already updating local state), `chat/ChatPageClient.tsx` (3), `library/LibrarySurface.tsx` (3), `AdminContactsTable.tsx` (3) | Each call re-fetches the full route tree after a mutation the client already applied: a second full render per save, often on top of the `revalidatePath` render. |
| `route-segment-config` | 277 | 151 `force-dynamic`, 13 `force-static`, ~106 `revalidate` | Blocks `cacheComponents`; every `force-dynamic` page has no static shell (TTFB = full render). |
| `runtime-nodejs-export` | 456 | 456 route files | Pure noise (Node is the default); JOV-7987 records it as a Cache Components blocker in 16.4.1. Deletion candidate. |
| `unstable-cache` | 39 | `lib/releases/release-matrix-loader.ts` (5), `[username]/[slug]/_lib/data.ts` (3), `dashboard-data.ts` (3) | Legacy API; tags fixed at definition, which is why dashboard entries share one global tag. |
| `no-store` | 46 | `dashboard/releases/actions.ts` (22), `tour-dates/actions.ts` (10), `events-actions.ts` (5) | Mostly `noStore()` at the top of server actions, where it does nothing. AI-slop pattern; also forces dynamic when the same module's readers run in RSC. |
| `fetch-in-effect` | 25 | `chat/ChatPageClient.tsx` (2), `MetadataAgentPanel.tsx` (2), `SignUpPageClient.tsx`, `YouTubeAssetDrawerPanels.tsx`, `YoutubeThumbnailSuccessClient.tsx` | Client waterfalls after hydration; no cache, dedupe or abort beyond hand-rolled code. |
| `polling` | 28 | admin shipping (3), HUD/Ovie (`OvieHomeCanvas`, `OvieInbox`, `useHudMetricsQuery`), `lib/queries/useSuggestionsQuery.ts`, `useDspEnrichmentStatusQuery.ts`, `useChatConversationQuery.ts` | Recurring requests while a tab is open; on HUD screens that run all day this is the largest steady request source. No push channel exists. |
| `db-client-path` | 4 | `lib/auth/session.ts`, `onboarding/actions/index.ts`, `lib/waitlist/settings.ts`, `dashboard-data.ts` import helpers from `@/lib/db/client` | No second pool exists; these bypass the canonical entry point for `withRetry`. |
| `await-db-in-loop` | 62 | `lib/leads/outreach-batch.ts` (5), `submission-agent/monitor-worker.ts` (5), `send-worker.ts` (5), `discography/credit-spotify-id-backfill-runner.ts` (3) | N+1 in workers and backfills (not request paths): longer job time and pool hold. Chunked batch loops are excluded. |
| `network-in-transaction` | 0 | — | Clean. Keep it at zero. |

Other findings:

- **Sequential awaits by design.** `fetchDashboardCoreWithSession`
  (`dashboard-data.ts:992-1038`) runs five reads in sequence "to avoid pool
  exhaustion". That is a pool-sizing workaround on the dashboard's critical path;
  revisit after the per-user cache key lands (fewer misses, so parallel reads
  stop threatening the 20-connection pool).
- **Duplicate cache layers for the same rows.** The public profile is cached in
  the Next data cache (`public-profile-loader.ts:306`) and the Redis edge cache
  (`invalidateProfileEdgeCache`), with separate invalidation calls.
- **Clerk-era residue.** No Clerk dependency remains, but `clerkUserId`/`clerkId`
  appears 779 times in 190 app files and RLS sets `app.clerk_user_id`
  (`lib/db/client/session.ts:70`). It is naming, not a dead adapter; rename is
  out of scope here and tracked by the existing `no-users-clerk-id-lookup` rule.
- **Unused or barely used dependencies (apps/web).** No import found:
  `@opentelemetry/sdk-trace-base`, `@tiptap/pm`, `@types/ws` (runtime dep),
  `import-in-the-middle`, `require-in-the-middle`, `tw-animate-css`, and ten
  `@radix-ui/*` packages listed only in `optimizePackageImports` (they reach the
  app through `@jovie/ui`). Some are peer/instrumentation requirements; verify
  before removal. Single-use: `chart.js` beside `recharts` (two chart libraries),
  `redis` (local dev client only).
- **Data libraries.** One per role already: Drizzle, Neon serverless, TanStack
  Query, Pacer, nuqs, Upstash. No SWR, axios, Zustand or second ORM. The registry
  in `canon/data-architecture.json` freezes that.

## Ranked fixes

1. Scope invalidation to the record (profile, dashboard) and stop family-tag
   flushes. Golden path: every artist edit; revenue path: public profile cache hit
   rate.
2. Replace `revalidatePath` + `router.refresh()` in dashboard actions with
   `updateTag(recordTag)` and an exact query-key update. One-field saves stop
   re-rendering the page.
3. Delete `runtime = 'nodejs'` (456) and no-op `noStore()` in actions (46), then
   migrate segment configs and `unstable_cache` to `'use cache'`; flip
   `cacheComponents` in web and ovie.
4. Replace HUD polling with an SSE stream or mutation events.

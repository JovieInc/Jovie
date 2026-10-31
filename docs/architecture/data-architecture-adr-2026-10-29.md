# ADR: One data architecture for the Next.js apps (2026-10-29)

Status: **accepted**. Owner: Summer (debt intake), any coder (fixes).
Scope: `apps/web` (Jovie + the Ovie admin tree), `apps/ovie`, `apps/console`,
`apps/docs`, `apps/should-i-make`.
Evidence: [data-architecture-audit-2026-10-29.md](data-architecture-audit-2026-10-29.md).
Enforced by: `node scripts/data-architecture-guard.mjs` (Source Validation +
`pnpm preflight:changed`), library registry `canon/data-architecture.json`, rule
`.claude/rules/data-architecture.md` (both land with the guard).
Sources read 2026-10-29: Next.js 16.4.1 bundled docs
(`node_modules/next/dist/docs/01-app/…/cacheComponents.md`,
`02-guides/migrating-to-cache-components.md`, `use-cache.md`), gbrain
`docs/database-stack-canonical-patterns`, `.claude/rules/db.md`.

This file is the one canonical copy of these decisions. `docs/CACHING_DECISIONS.md`
is the tag inventory; it does not restate policy.

## Decisions

| # | Area | Decision |
|---|---|---|
| D1 | Read | Server Components read data on the server. Cached reads are `'use cache'` functions with `cacheTag(<record tag>)` + `cacheLife(<profile>)`. Per-request dedupe of the same loader uses React `cache()`. |
| D2 | Mutate | One write path: a server action (UI) or route handler (API, mobile, webhooks) that calls the registered domain write function, then invalidates **only the changed record's tag**: `updateTag(tag)` in a server action (read-your-writes), `revalidateTag(tag, 'max')` elsewhere. No `revalidatePath`, no layout revalidation, no cross-tenant family tags. |
| D3 | Client cache | TanStack Query is the only client cache, used only where the client needs interactivity (optimistic edits, infinite lists, live status). Keys live in `lib/queries`; seed from RSC data (`initialData`), never refetch what the server already rendered. After a mutation update the exact key (`setQueryData` from the action's returned value, or `invalidateQueries({ queryKey: exactKey })`). No `router.refresh()`. |
| D4 | Pacer | `@tanstack/react-pacer` is for user-input timing only: debounce (search, autosave), throttle (scroll), rate-limit (chat send). It is not a cache or fetcher. `lib/pacer/cache.ts` and `lib/db/cache.ts`'s in-memory layer are not new homes for cached data. |
| D5 | DB client | One client: `import { db } from '@/lib/db'`. Neon WebSocket `Pool` (max 20 per container) on the **direct** endpoint, because RLS sets session state with `set_config`; the transaction pooler cannot carry it. HTTP `neon()` only in `apps/web/scripts`. Test-only drivers (`postgres`, `pglite`) never in app code. |
| D6 | Transactions | Only through the approved wrappers (`runAtomicDbOperation`, RLS session helpers). Callbacks are DB-only: no `fetch`, Stripe, email or model calls inside a transaction. Loops of awaited queries become one batched statement. |
| D7 | Realtime | Push, don't poll. Live surfaces use a route-handler SSE stream (the AI SDK chat stream is the existing one) or refetch-on-event after the mutation that changed the data. Polling stays only where the source has no event (third-party job progress), with a `data-arch-allow:` reason. No websocket vendor. |
| D8 | Migrations | `drizzle-kit generate` creates versioned SQL; `apps/web/scripts/drizzle-migrate.ts` applies it on the direct endpoint; `db:verify` checks the ledger. `drizzle-kit push`/`migrate` are not used against shared databases. Unchanged from `.claude/rules/db.md`. |
| D9 | Cache Components | Target state: `cacheComponents: true` + `partialPrefetching: true` in every Next.js app. Small apps enable it now. `apps/web`/`apps/ovie` enable it when the `route-segment-config`, `runtime-nodejs-export` and `unstable-cache` ratchets reach zero (JOV-7985 / JOV-7987 own the flip). Until then no new segment configs, no new `unstable_cache`, no new `noStore()`. |
| D10 | Libraries | Every data, cache, client-state, realtime or DB library is listed once in `canon/data-architecture.json` with its one role. A second library for a role needs an amendment here first. |
| D11 | Redis | Upstash Redis holds durable cross-instance state (rate limits, locks, dedupe, counters). It is not a second read cache for data the Next cache can hold; the profile edge cache stays only until `'use cache: remote'` replaces it with a measured comparison. |

Escape hatch: one occurrence may carry `data-arch-allow: <reason>` (10+
characters, same line or a comment line above). Allows are counted in the
guard's output and in the debt metric; they are reviewed, not free.

## Why

The audit found five cache layers (Next data cache via `unstable_cache`, React
`cache()`, `lib/db/cache.ts` memory+Redis, the Redis profile edge cache, and
TanStack Query) and three invalidation styles (`revalidatePath`, tags,
`router.refresh()`), mixed per feature. A one-field save in the dashboard runs a
server action that calls `revalidatePath` on two or three routes, which makes the
action response re-render the whole current route; the client then calls
`router.refresh()` and renders it again. Global tags (`dashboard-data`,
`profiles-all`) flush every artist's cache when one artist edits one field.
Tags scoped to the record fix both: the edit invalidates one entry, and the
client updates one query key.

## Ship now / Re-evaluate when / Then

- **Ship now:** guard + ratchet (new violations fail, existing ones only shrink);
  daily remediation sweep files one owned Linear issue per rule with debt; scope
  the profile family-tag flush; enable Cache Components in `apps/console` and
  `apps/should-i-make`.
- **Re-evaluate when:** `route-segment-config` + `runtime-nodejs-export` +
  `unstable-cache` reach zero in `apps/web`, or the public profile loader takes
  an immutable profile-id tag.
- **Then:** flip `cacheComponents` in `apps/web` and `apps/ovie`, delete
  `unstable_cache` and the global `profiles-all` invalidation in
  `lib/cache/releases.ts`, and move this ADR's D9 to "done".

Confidence 0.8 that this is the right end state; 0.6 that the ratchet alone
drives the web migration to zero within a quarter without a dedicated lane.

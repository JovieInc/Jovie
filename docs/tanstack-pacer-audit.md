# TanStack Pacer Audit

## Issue #1: Direct Pacer hook usage in feature components

Status: ✅ Completed in JOV-626

### Coverage updates

The following direct imports from `@tanstack/react-pacer` were replaced with centralized imports from `@/lib/pacer` or `@/lib/pacer/hooks`:

- `apps/web/lib/queries/useArtistSearchQuery.ts`
- `apps/web/components/organisms/table/molecules/TableSearchBar.tsx`
- `apps/web/components/dashboard/organisms/links/hooks/useLinksPersistence.ts`
- `apps/web/components/dashboard/organisms/release-provider-matrix/hooks/useSortingManager.ts`
- `apps/web/components/home/FeaturedArtistsDriftRow.tsx`

### New centralized hook adoption

`TableSearchBar` now uses the shared `useDebouncedInput` hook from `@/lib/pacer/hooks`, ensuring consistent input debouncing behavior and avoiding one-off component-level pacer wiring.

## Issue #2: Competing search lifecycle (`useAsyncSearch`) vs Query-owned search

Status: ✅ Completed in JOV-6189

### Decision

`lib/pacer/hooks/useAsyncSearch.ts` (debounced search with its own
results/errors/retries state) had zero live consumers and duplicated the
server-state lifecycle that `lib/queries/useUnifiedArtistSearchQuery.ts`
already owns: TanStack Query owns request-backed server state, cache, and
targeted invalidation; Pacer (`useAsyncDebouncer`) owns only the local
debounce pacing. Retired the hook and its barrel exports
(`lib/pacer/hooks.ts`, `lib/pacer/hooks/index.ts`, `lib/pacer/index.ts`).

### Canonical Pacer import surface

Source-decided (all live consumers verified): import application-specific
hooks from deep paths under `@/lib/pacer/hooks/*` or the
`@/lib/pacer/hooks` barrel; error utilities from `@/lib/pacer/errors`.
Primitive hooks (`useDebouncer`, `useThrottler`, `useAsyncDebouncer`,
`useAsyncRateLimiter`, `Debouncer`) are imported from `@tanstack/react-pacer`
directly where a primitive is the right tool (JOV-626 removed only one-off
duplicated wrappers, not primitives). The deprecated root barrel
`@/lib/pacer` (`lib/pacer/index.ts`) and the legacy `lib/pacer/hooks.ts`
back-compat barrel have no importers; treat deep imports as canonical.

### Remaining JOV-6189 inventory (retained / follow-up)

- `lib/queries/useUnifiedArtistSearchQuery.ts` — canonical search owner
  (retained).
- `lib/pacer` validation/auto-save/debounce hooks — live consumers
  (retained).
- `lib/fetch` deduped-fetch lifecycle (`deduped-fetch.ts`,
  `use-deduped-fetch.ts`, barrel, both unit tests) — zero live consumers;
  same-scope dedupe is already owned by TanStack Query. Retirement is a
  ~1,200-line deletion that exceeds the standard PR size cap — split into a
  follow-up slice (owner `big-pr`/`codemod` label or a stacked retirement).

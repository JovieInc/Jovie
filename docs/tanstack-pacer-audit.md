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

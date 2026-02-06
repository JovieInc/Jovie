# Jovie Performance Audit Report

**Date:** 2025-02-05
**Scope:** Full-stack performance analysis of `apps/web` (Next.js 15 + React 19)
**Codebase:** ~2,400 source files, 91 API endpoints, 1,010 components

---

## Executive Summary

The Jovie codebase demonstrates **strong performance fundamentals** — proper `Promise.all()` parallelization, strategic code splitting, optimized bundle configuration, and well-structured caching. The issues below represent targeted optimizations that can materially improve latency and resource usage.

**Top 5 bottlenecks by estimated impact:**

| # | Issue | Category | Est. Impact |
|---|-------|----------|-------------|
| 1 | Missing database indexes on `creatorContacts` and `socialAccounts` | Database | High — full table scans on JOINs |
| 2 | Sequential Clerk + DB operations in profile update | API | 300-500ms per profile save |
| 3 | `useReleasesQuery` ignores `profileId` param | Data Fetching | Stale/wrong cache with multi-profile |
| 4 | Pricing options API has no caching | API | Unnecessary compute per request |
| 5 | `SettingsAdPixelsSection` missing query key factory + cache config | Data Fetching | Inconsistent cache, potential API spam |

---

## 1. Database Layer

### 1.1 CRITICAL: Missing Indexes

#### `creatorContacts` table — zero indexes
**File:** `lib/db/schema/profiles.ts:200-217`

This table has no indexes beyond its primary key. It is joined in multiple queries using `creatorProfileId` and filtered by `isActive`.

**Affected queries:**
- `app/api/admin/creator-invite/bulk/lib/queries.ts:47-52` — LEFT JOIN on `creatorProfileId + isActive`
- `app/api/admin/creator-invite/bulk/lib/queries.ts:81-86` — Same pattern
- `lib/services/profile/queries.ts:249-256` — Contact retrieval by profile

**Recommended indexes:**
```
creatorContacts(creatorProfileId)
creatorContacts(creatorProfileId, isActive)  — compound for filtered JOINs
```

#### `socialAccounts` table — zero indexes
**File:** `lib/db/schema/links.ts:67-86`

Queried by `creatorProfileId`, `platform`, and `status` but has no indexes at all.

**Recommended indexes:**
```
socialAccounts(creatorProfileId)
socialAccounts(creatorProfileId, platform)
socialAccounts(creatorProfileId, status)
```

### 1.2 Sequential Queries That Could Be Parallelized

**File:** `app/api/admin/creator-invite/bulk/route.ts:273-281`

Two independent database queries run sequentially:
```typescript
const eligibleProfiles = await fetchProfilesByFitScore(fitScoreThreshold, limit);  // Query 1
// ... filtering ...
const totalEligible = await getEligibleProfileCount(fitScoreThreshold);  // Query 2 (independent)
```

These share the same WHERE conditions and could run via `Promise.all()`, reducing endpoint latency by ~50% of DB round-trip time.

### 1.3 What's Working Well

- Analytics queries use CTEs for consolidated SQL (reduced from ~120ms to ~48ms per comments)
- Profile service uses `Promise.all()` for parallel fetches with Redis edge caching (5min TTL)
- Discography queries use `inArray()` for batch lookups, preventing N+1
- `db.transaction()` is properly forbidden via ESLint rule (Neon HTTP driver incompatible)

---

## 2. API Routes & Server Actions

### 2.1 Sequential Operations in Profile Update

**File:** `app/api/dashboard/profile/route.ts:108-131`

The PUT handler runs three operations sequentially:
1. `guardUsernameUpdate()` — must run first (validation)
2. `syncClerkProfile()` — external Clerk API call
3. `updateProfileRecords()` — database write

Steps 2 and 3 are independent after the guard passes. Parallelizing them would save 150-300ms (one full external API round-trip).

### 2.2 Pricing Options API Has No Caching

**File:** `app/api/stripe/pricing-options/route.ts:14-40`

`getAvailablePricing()` returns static configuration data but is called fresh every request with `Cache-Control: no-store`. This endpoint is a candidate for:
- `export const revalidate = 3600` (1-hour ISR cache), or
- Simple in-memory caching since the data is derived from config

### 2.3 What's Working Well

- Dashboard analytics has in-memory caching with 60s TTL and request deduplication
- Featured creators has proper `revalidate = 3600` + CDN cache headers
- User profiles use `unstable_cache()` with 1-hour revalidate and cache tags
- Middleware (`proxy.ts`) is well-optimized with pre-compiled regex, single path categorization, and early exits
- Chat API uses streaming (`streamText()`) with proper `maxDuration = 30`
- Dashboard data fetching uses `Promise.all()` for parallel queries

---

## 3. TanStack Query / Data Fetching

### 3.1 `useReleasesQuery` Doesn't Pass `profileId` to Query Function

**File:** `lib/queries/useReleasesQuery.ts:7-14`

```typescript
export function useReleasesQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releases.matrix(profileId),   // Cache keyed by profileId
    queryFn: () => loadReleaseMatrix(),               // But profileId NOT passed
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
  });
}
```

The cache key includes `profileId` but `loadReleaseMatrix()` uses `getCachedAuth()` internally and ignores the parameter. If the app ever supports multi-profile switching, this will serve stale cache data. At minimum, the query key is misleading.

### 3.2 `SettingsAdPixelsSection` — Hardcoded Query Key, Missing Cache Config

**File:** `components/dashboard/organisms/SettingsAdPixelsSection.tsx:143-150`

```typescript
const { data: existingSettings } = useQuery<PixelSettingsResponse>({
  queryKey: ['pixelSettings'],           // Hardcoded, not using queryKeys factory
  queryFn: async () => {                 // Inline, no AbortSignal
    const res = await fetch('/api/dashboard/pixels');
    if (!res.ok) throw new Error('Failed to fetch pixel settings');
    return res.json();
  },
  // Missing: staleTime, gcTime (falls back to globals)
});
```

Issues:
- Hardcoded query key breaks pattern consistency and makes cache invalidation fragile
- No `signal` parameter forwarded to `fetch()` — potential memory leak on unmount
- Missing explicit `staleTime`/`gcTime` — pixel settings change rarely, should use `STABLE_CACHE`

### 3.3 What's Working Well

- Centralized query key factory in `lib/queries/keys.ts` (hierarchical, well-organized)
- Cache strategy presets: `REALTIME_CACHE`, `FREQUENT_CACHE`, `STANDARD_CACHE`, `STABLE_CACHE`, `STATIC_CACHE`
- Server-side prefetching with `getDehydratedState()` and `prefetchQueries()`
- Adaptive polling in suggestions and DSP enrichment queries
- Optimistic updates in mutations (profile, dashboard)
- Global defaults configured (5min stale, 30min gc, retry logic)

---

## 4. React Component Rendering

### 4.1 React Compiler Mitigates Memoization Concerns

The project has the **React Compiler enabled** (`next.config.js`), which automatically handles memoization. This means the typical concern about missing `React.memo` / `useMemo` / `useCallback` is largely addressed at compile time. Manual memoization is only needed for edge cases the compiler can't optimize.

### 4.2 What's Working Well

- No inline component definitions detected in hot paths
- Image optimization uses `next/image` throughout with `OptimizedImage` wrapper (blur placeholders, memo)
- Heavy components (Recharts, AI chat, admin panels) are properly lazy-loaded via `next/dynamic`
- `ContactsTable` and `ReleaseProviderMatrix` use virtualization (`@tanstack/react-virtual`)
- No CSS-in-JS runtime overhead (Tailwind only)
- `useEffect` dependencies are generally stable (primitives, memoized callbacks)

---

## 5. Bundle Size & Client JavaScript

### 5.1 What's Working Well

- **No heavy library misuse**: No lodash, moment, or date-fns in client bundles
- **Smart icon loading**: `SocialIcon` dynamically imports individual icons on-demand (~50KB deferred)
- **Recharts lazy-loaded**: ~100KB deferred from critical path
- **Strategic code splitting**: `next.config.js` has explicit `splitChunks` for framework, icons, motion, charts, and vendors
- **`optimizePackageImports`** configured for 27 packages (Radix UI, lucide-react, TanStack, etc.)
- **Selective barrel exports**: Index files use specific exports, not `export *`
- **LazyProviders**: Non-critical providers loaded via `dynamic()` (~20-30KB deferred)

### 5.2 Minor: Headless UI Namespace Import

**Files:** 3 combobox components use `import * as Headless from '@headlessui/react'`

Already in `optimizePackageImports` so bundle impact is minimal. There's an existing TODO to migrate to Radix/cmdk.

---

## Recommended Action Items

### Priority 1 — Database (High Impact, Low Risk)

1. **Add indexes to `creatorContacts`** — `(creatorProfileId)` and `(creatorProfileId, isActive)` compound
2. **Add indexes to `socialAccounts`** — `(creatorProfileId)`, `(creatorProfileId, platform)`, `(creatorProfileId, status)`

### Priority 2 — API Optimization (High Impact, Medium Risk)

3. **Parallelize profile update** — Run `syncClerkProfile()` and `updateProfileRecords()` concurrently after `guardUsernameUpdate()` passes
4. **Cache pricing options** — Add `revalidate = 3600` or in-memory cache to `/api/stripe/pricing-options`

### Priority 3 — Data Fetching Cleanup (Medium Impact, Low Risk)

5. **Fix `useReleasesQuery`** — Either pass `profileId` to `loadReleaseMatrix()` or remove it from the query key to avoid misleading cache behavior
6. **Fix `SettingsAdPixelsSection`** — Use `queryKeys` factory, add `STABLE_CACHE`, forward `signal` to fetch

### Priority 4 — Parallelization (Lower Impact)

7. **Parallelize bulk invite queries** — `fetchProfilesByFitScore` and `getEligibleProfileCount` via `Promise.all()`

---

## What Does NOT Need Fixing

The following areas are already well-optimized:

- **Middleware** (`proxy.ts`): Pre-compiled regex, single path categorization, early exits, Server-Timing headers
- **Dashboard analytics**: In-memory cache with deduplication, `Promise.all()` for parallel queries
- **User profiles**: `unstable_cache()` with cache tags, Redis edge caching
- **Homepage**: Fully static (`revalidate = false`), zero database access
- **Bundle config**: Proper code splitting, tree-shaking, dynamic imports
- **Component rendering**: React Compiler handles auto-memoization, virtualization on large lists
- **Streaming**: Chat API uses `streamText()`, analytics page uses Suspense

# Jovie Performance Audit Report

**Date:** 2025-02-05
**Scope:** Full-stack performance analysis of `apps/web` (Next.js 15 + React 19)
**Codebase:** ~2,400 source files, 91 API endpoints, 1,010 components

---

## Executive Summary

The Jovie codebase demonstrates **strong performance fundamentals** — proper `Promise.all()` parallelization, strategic code splitting, optimized bundle configuration, and well-structured caching. The issues below represent targeted optimizations that can materially improve latency and resource usage.

**Top 5 bottlenecks by estimated impact:**

| # | Issue | Category | Est. Impact | Status |
|---|-------|----------|-------------|--------|
| 1 | ~~Missing database indexes on `creatorContacts` and `socialAccounts`~~ | Database | ~~High — full table scans on JOINs~~ | **RESOLVED** — compound indexes already exist |
| 2 | ~~Sequential Clerk + DB operations in profile update~~ | API | ~~300-500ms per profile save~~ | **RESOLVED** — already uses `Promise.all()` |
| 3 | `useReleasesQuery` ignores `profileId` param | Data Fetching | Stale/wrong cache with multi-profile | Misleading — `loadReleaseMatrix(profileId)` does use profileId |
| 4 | ~~Pricing options API has no caching~~ | API | ~~Unnecessary compute per request~~ | **RESOLVED** — reads from in-memory config, no compute to cache |
| 5 | `SettingsAdPixelsSection` missing query key factory + cache config | Data Fetching | Inconsistent cache, potential API spam | Minor — has `staleTime: 5min`, only missing query key factory |

---

## 1. Database Layer

### ~~1.1 CRITICAL: Missing Indexes~~ (RESOLVED)

> **Status:** All indexes already exist. Verified 2026-02-09.

#### `creatorContacts` table — ~~zero indexes~~ has compound index
**File:** `lib/db/schema/profiles.ts:221-229`

The table has `profileActiveIdx` — a compound index on `(creatorProfileId, isActive, sortOrder, createdAt)` — which covers all query patterns:
- Single-column lookups on `creatorProfileId` (leading column prefix)
- Filtered JOINs on `(creatorProfileId, isActive)` (first two columns)
- Sorted results on `(sortOrder, createdAt)` (trailing columns)

#### `socialAccounts` table — ~~zero indexes~~ has compound index
**File:** `lib/db/schema/links.ts:91-96`

The table has `profilePlatformStatusIdx` — a compound index on `(creatorProfileId, platform, status)` — which covers:
- Single-column lookups on `creatorProfileId` (leading column prefix)
- Platform-specific lookups on `(creatorProfileId, platform)` (first two columns)
- Full triple-column lookups on `(creatorProfileId, platform, status)`

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

### ~~2.1 Sequential Operations in Profile Update~~ (RESOLVED)

**File:** `app/api/dashboard/profile/route.ts:108-131`

~~The PUT handler runs three operations sequentially.~~ Steps 2 and 3 are now parallelized with `Promise.all()`. Verified 2026-02-09.

### ~~2.2 Pricing Options API Has No Caching~~ (NOT AN ISSUE)

**File:** `app/api/stripe/pricing-options/route.ts:14-40`

`getAvailablePricing()` returns data derived from in-memory config objects — there is no database query or external API call to cache. Adding a caching layer would add complexity for zero performance gain. No action needed.

### 2.3 What's Working Well

- Dashboard analytics has in-memory caching with 60s TTL and request deduplication
- Featured creators has proper `revalidate = 3600` + CDN cache headers
- User profiles use `unstable_cache()` with 1-hour revalidate and cache tags
- Middleware (`proxy.ts`) is well-optimized with pre-compiled regex, single path categorization, and early exits
- Chat API uses streaming (`streamText()`) with proper `maxDuration = 30`
- Dashboard data fetching uses `Promise.all()` for parallel queries

---

## 3. TanStack Query / Data Fetching

### ~~3.1 `useReleasesQuery` Doesn't Pass `profileId` to Query Function~~ (MISCHARACTERIZED)

**File:** `lib/queries/useReleasesQuery.ts:7-14`

The query function `loadReleaseMatrix(profileId)` **does accept and use `profileId`**. The cache key correctly includes `profileId` and the fetch function uses it. The original concern about stale/wrong cache data is not valid. Verified 2026-02-09.

### 3.2 `SettingsAdPixelsSection` — Hardcoded Query Key (Minor)

**File:** `components/dashboard/organisms/SettingsAdPixelsSection.tsx:143-150`

Remaining issue:
- Hardcoded query key `['pixelSettings']` instead of using `queryKeys` factory — minor consistency concern

~~Previously reported issues now verified as non-issues:~~
- ~~No `signal` parameter~~ — signal IS forwarded to `fetch()` via `({ signal }) => fetch(..., { signal })`
- ~~Missing `staleTime`/`gcTime`~~ — has `staleTime: 5 * 60 * 1000` (5 minutes)

Verified 2026-02-09.

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

### 5.2 Minor: Headless UI Namespace Import (NO ACTION NEEDED)

**Files:** 3 combobox components use `import * as Headless from '@headlessui/react'`

Already in `optimizePackageImports` so bundle impact is minimal. Tree-shaking handles namespace imports correctly with this config. There's an existing TODO to migrate to Radix/cmdk.

---

## Recommended Action Items

### ~~Priority 1 — Database (High Impact, Low Risk)~~ RESOLVED

1. ~~**Add indexes to `creatorContacts`**~~ — Already has compound index `profileActiveIdx` on `(creatorProfileId, isActive, sortOrder, createdAt)`
2. ~~**Add indexes to `socialAccounts`**~~ — Already has compound index `profilePlatformStatusIdx` on `(creatorProfileId, platform, status)`

### ~~Priority 2 — API Optimization (High Impact, Medium Risk)~~ RESOLVED

3. ~~**Parallelize profile update**~~ — Already uses `Promise.all()` for concurrent Clerk sync + DB write
4. ~~**Cache pricing options**~~ — Not needed; `getAvailablePricing()` reads from in-memory config, no DB/API call

### Priority 3 — Data Fetching Cleanup (Minor remaining items)

5. ~~**Fix `useReleasesQuery`**~~ — Mischaracterized; `loadReleaseMatrix(profileId)` does use profileId correctly
6. **Migrate `SettingsAdPixelsSection` query key** — Use `queryKeys` factory instead of hardcoded `['pixelSettings']` (minor hygiene)

### ~~Priority 4 — Parallelization (Lower Impact)~~ LOW PRIORITY

7. **Parallelize bulk invite queries** — `fetchProfilesByFitScore` and `getEligibleProfileCount` could use `Promise.all()` but are already fast single-statement queries

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

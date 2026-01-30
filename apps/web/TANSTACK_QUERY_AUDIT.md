# TanStack Query Audit Report

**Date:** 2026-01-30
**Branch:** `claude/audit-tanstack-query-GnJnl`

## Executive Summary

The Jovie codebase has a **well-architected TanStack Query implementation** with ~6,500 lines across 47+ files. The foundation is solid with query key factories, cache strategy presets, and SSR integration. However, there are **specific opportunities for optimization** that could improve performance, reduce bundle size, and enhance UX.

---

## Current Architecture (Strengths)

### 1. Query Key Factory (`keys.ts`)
Hierarchical, type-safe query key structure enabling granular cache invalidation:
```typescript
queryKeys.billing.all          // Invalidate all billing
queryKeys.billing.status()     // Specific status query
queryKeys.dspEnrichment.matches(profileId, status)  // Parameterized
```

### 2. Cache Strategy Presets (`cache-strategies.ts`)
Six well-defined presets for consistent caching behavior:

| Preset | staleTime | gcTime | Use Case |
|--------|-----------|--------|----------|
| `REALTIME_CACHE` | 0 | 5 min | Live feeds, notifications |
| `FREQUENT_CACHE` | 1 min | 10 min | Dashboard stats |
| `STANDARD_CACHE` | 5 min | 30 min | User profile, settings |
| `STABLE_CACHE` | 15 min | 1 hour | Feature flags, config |
| `STATIC_CACHE` | 1 hour | 2 hours | Categories, platform lists |
| `PAGINATED_CACHE` | 5 min | 30 min | Infinite scroll (unused) |

### 3. SSR Integration (`server.ts`, `HydrateClient.tsx`)
- Server-side `getQueryClient()` with React's `cache()` for request isolation
- `prefetchQuery()` and `prefetchQueries()` helpers for parallel prefetching
- `HydrationBoundary` wrapper for seamless client hydration

### 4. Error Handling (`mutation-utils.ts`, `fetch.ts`)
- `FetchError` class with `isRetryable()` method
- `handleMutationError()` with toast + Sentry integration
- `getErrorMessage()` for status-specific user messages

### 5. Advanced Patterns
- **Adaptive polling** with exponential backoff (`useSuggestionsQuery.ts`)
- **Dynamic polling** that stops when complete (`useDspEnrichmentStatusQuery.ts`)
- **Debounced search** with TanStack Pacer (`useArtistSearchQuery.ts`)

---

## Improvement Opportunities

### HIGH PRIORITY

#### 1. Convert `useLinksPersistence.ts` to Use `useMutation`

**Location:** `components/dashboard/organisms/links/hooks/useLinksPersistence.ts:232`

**Issue:** Raw `fetch()` call with manual error handling, missing TanStack Query benefits.

**Current (lines 232-240):**
```typescript
const response = await fetch('/api/dashboard/social-links', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    profileId,
    links: payload,
    expectedVersion: linksVersion,
  }),
});
```

**Recommendation:** Use `useSaveSocialLinksMutation` from `useDashboardSocialLinksQuery.ts` which already exists but isn't being used here.

**Benefits:**
- Automatic retry on network failures
- Request deduplication
- Consistent error handling
- Loading state via `isPending`

---

#### 2. Add AbortSignal to Queries Missing It

**Files affected:**
- `useNotificationStatusQuery.ts:45` - No signal passed
- `useReleasesQuery.ts:10` - No signal passed
- `useCampaignInvites.ts:128` - No signal passed

**Current:**
```typescript
queryFn: () => getNotificationStatus({ artistId, ... })
```

**Recommended:**
```typescript
queryFn: ({ signal }) => getNotificationStatus({ artistId, ... }, signal)
```

**Why:** Without AbortSignal, cancelled queries (e.g., when component unmounts or query key changes) continue fetching, wasting resources.

---

#### 3. Centralize `campaignQueryKeys` into Main Query Keys Factory

**Location:** `useCampaignInvites.ts:73-78`

**Issue:** Duplicated query key factory pattern instead of using central `queryKeys` from `keys.ts`.

**Current:**
```typescript
export const campaignQueryKeys = {
  all: ['campaign-invites'] as const,
  preview: (threshold: number, limit: number) => [...],
};
```

**Recommended:** Add to `keys.ts`:
```typescript
export const queryKeys = {
  // ... existing keys
  campaign: {
    all: ['campaign-invites'] as const,
    preview: (threshold: number, limit: number) =>
      [...queryKeys.campaign.all, 'preview', { threshold, limit }] as const,
    stats: () => [...queryKeys.campaign.all, 'stats'] as const,
  },
};
```

---

### MEDIUM PRIORITY

#### 4. Increase `select` Usage for Derived Data

**Current state:** Only 1 hook uses `select` (`useSuggestionsQuery.ts:182`)

**Opportunity:** Use `select` to transform/filter data without triggering re-renders on unchanged derived data.

**Example candidates:**

```typescript
// useDashboardSocialLinksQuery.ts - Filter only visible links
export function useVisibleLinksQuery(profileId: string) {
  return useDashboardSocialLinksQuery({
    profileId,
    select: (data) => data.filter(link => link.isActive),
  });
}

// useBillingStatusQuery.ts - Extract just subscription tier
export function useSubscriptionTier() {
  return useBillingStatusQuery({
    select: (data) => data.subscriptionTier,
  });
}
```

**Benefits:**
- Components only re-render when selected data changes
- Memoization is automatic
- No need for `useMemo` in components

---

#### 5. Add `placeholderData` for Better Loading UX

**Current state:** Only 1 hook uses `placeholderData` (`useAdminSocialLinksQuery.ts:88`)

**Opportunity:** Show stale data instantly while fresh data loads.

**Pattern 1: Keep Previous Data (for filtered/paginated queries)**
```typescript
// When switching filters, show old data immediately
export function useDspMatchesQuery({ status }) {
  return useQuery({
    queryKey: queryKeys.dspEnrichment.matches(profileId, status),
    queryFn: ...,
    placeholderData: keepPreviousData,  // Built-in helper
  });
}
```

**Pattern 2: Use Initial Fallback**
```typescript
export function useBillingStatusQuery() {
  return useQuery({
    ...STANDARD_CACHE,
    queryKey: queryKeys.billing.status(),
    queryFn: fetchBillingStatus,
    placeholderData: { tier: 'free', features: [] },  // Type-safe fallback
  });
}
```

---

#### 6. Consider `useSuspenseQuery` for Critical Data

**Current state:** 0 usages of `useSuspenseQuery`

**Opportunity:** Simplify loading states by leveraging React Suspense.

**Before (current pattern):**
```typescript
function DashboardPage() {
  const { data, isLoading, error } = useDashboardProfileQuery();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState />;

  return <Dashboard profile={data} />;  // data could still be undefined
}
```

**After (with Suspense):**
```typescript
function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ErrorBoundary fallback={<ErrorState />}>
        <DashboardContent />
      </ErrorBoundary>
    </Suspense>
  );
}

function DashboardContent() {
  const { data } = useSuspenseDashboardProfileQuery();
  return <Dashboard profile={data} />;  // data is guaranteed non-null
}
```

**Benefits:**
- Cleaner component code (no loading/error checks)
- Automatic streaming with SSR
- Better composability with nested Suspense boundaries

---

#### 7. Implement `useInfiniteQuery` for Paginated Data

**Current state:** `PAGINATED_CACHE` preset exists but 0 `useInfiniteQuery` implementations.

**Candidates:**
- Admin creator list
- Activity feed (if paginated)
- Release history

**Example implementation:**
```typescript
export function useCreatorsInfiniteQuery() {
  return useInfiniteQuery({
    queryKey: queryKeys.creators.list(),
    queryFn: ({ pageParam = 0, signal }) =>
      fetchCreators({ offset: pageParam, limit: 20 }, signal),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * 20 : undefined,
    ...PAGINATED_CACHE,
  });
}
```

---

### LOW PRIORITY

#### 8. Enable `structuralSharing` Explicitly for Large Responses

**Current state:** Only 1 hook explicitly sets `structuralSharing: true`

**Context:** TanStack Query's `structuralSharing` is enabled by default, but explicitly setting it documents intent and can be disabled for very large responses where comparison is costly.

**When to disable:**
```typescript
// For large binary/file responses
useQuery({
  queryKey: ['large-export'],
  queryFn: fetchLargeExport,
  structuralSharing: false,  // Skip deep comparison
});
```

---

#### 9. Standardize Cache Preset Usage

**Files with inline config instead of presets:**
- `useActivityFeedQuery.ts` - Custom config (acceptable, has polling)
- `useCampaignInvites.ts` - Should use `FREQUENT_CACHE`
- `useNotificationStatusQuery.ts:52-53` - Should use `STANDARD_CACHE`

**Pattern:**
```diff
// useNotificationStatusQuery.ts
export function useNotificationStatusQuery(...) {
  return useQuery({
    queryKey: queryKeys.notifications.status(...),
    queryFn: ...,
-   staleTime: 5 * MINUTE,
-   gcTime: 30 * MINUTE,
+   ...STANDARD_CACHE,
    retry: 2,
    retryDelay: getRetryDelay,
  });
}
```

---

#### 10. Expand `QueryErrorBoundary` Usage

**Current state:** Component exists at `QueryErrorBoundary.tsx` but underutilized.

**Recommendation:** Wrap major dashboard sections:
```tsx
// In dashboard layout
<QueryErrorBoundary fallback={<DashboardErrorFallback />}>
  <DashboardContent />
</QueryErrorBoundary>
```

---

## Quick Wins (Minimal Effort, High Impact)

| # | Change | File(s) | Effort |
|---|--------|---------|--------|
| 1 | Add signal to `useNotificationStatusQuery` queryFn | `useNotificationStatusQuery.ts` | 5 min |
| 2 | Add signal to `useReleasesQuery` queryFn | `useReleasesQuery.ts` | 5 min |
| 3 | Use `STANDARD_CACHE` preset in `useNotificationStatusQuery` | `useNotificationStatusQuery.ts` | 2 min |
| 4 | Move `campaignQueryKeys` to central `keys.ts` | `keys.ts`, `useCampaignInvites.ts` | 15 min |
| 5 | Add `placeholderData: keepPreviousData` to filtered queries | Various | 10 min |

---

## Metrics Summary

| Metric | Current | Recommendation |
|--------|---------|----------------|
| Hooks using cache presets | ~70% | 100% |
| Hooks with AbortSignal | ~80% | 100% |
| `select` usage | 1 hook | 5+ hooks |
| `placeholderData` usage | 1 hook | 5+ hooks |
| `useInfiniteQuery` usage | 0 | 1-2 for paginated data |
| `useSuspenseQuery` usage | 0 | Consider for critical paths |
| Raw fetch in mutation-like operations | 1 file | 0 |

---

## Implementation Roadmap

### Phase 1: Quick Fixes (1-2 hours)
1. Add AbortSignal to 3 queries
2. Standardize cache presets in 3 hooks
3. Centralize campaign query keys

### Phase 2: UX Improvements (4-6 hours)
1. Add `placeholderData` to 5 filtered/parameterized queries
2. Add `select` to 3-5 queries for derived data
3. Convert `useLinksPersistence` to use mutation hook

### Phase 3: Architecture Evolution (1-2 days)
1. Evaluate and implement `useInfiniteQuery` for paginated lists
2. Pilot `useSuspenseQuery` in one dashboard section
3. Expand `QueryErrorBoundary` coverage

---

## Files Referenced

| Category | Files |
|----------|-------|
| Configuration | `lib/queries/keys.ts`, `lib/queries/cache-strategies.ts`, `components/providers/QueryProvider.tsx` |
| Query Hooks | `lib/queries/use*.ts` (19 files) |
| Mutation Hooks | `lib/queries/use*Mutation*.ts` (9 files) |
| Utilities | `lib/queries/fetch.ts`, `lib/queries/mutation-utils.ts`, `lib/queries/server.ts` |
| Components | `lib/queries/HydrateClient.tsx`, `lib/queries/QueryErrorBoundary.tsx` |
| Needs Attention | `components/dashboard/organisms/links/hooks/useLinksPersistence.ts` |

---

## Related Documentation

- Previous audit: `DATA_FETCHING_AUDIT.md` (2026-01-20)
- TanStack Query docs: https://tanstack.com/query/latest

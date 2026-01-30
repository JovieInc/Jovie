# Data Fetching Audit Report

**Date:** 2026-01-20
**Branch:** `claude/audit-data-fetching-yMP6r`

## Executive Summary

The Jovie codebase has a well-architected data fetching foundation using React Query (TanStack Query) for client-side state management, Next.js Server Actions for mutations, and Next.js caching (unstable_cache + ISR) for public pages. However, there are **43 files** with raw `fetch()` calls that could benefit from React Query's caching and state management, and several inconsistencies in error handling and cache invalidation patterns.

---

## Current Architecture (Strengths)

### 1. React Query Infrastructure
**Location:** `/apps/web/lib/queries/`

- **Cache Strategies** (`cache-strategies.ts`): Well-defined presets for different data types
  - `REALTIME_CACHE`: 30s polling for live data
  - `FREQUENT_CACHE`: 1 min stale time for dashboard stats
  - `STANDARD_CACHE`: 5 min stale time (default)
  - `STABLE_CACHE`: 15 min stale time for reference data
  - `STATIC_CACHE`: 1 hour for rarely-changing content
  - `PAGINATED_CACHE`: Optimized for infinite scroll

- **Query Keys Factory** (`keys.ts`): Hierarchical key structure enabling granular cache invalidation

- **Fetch Utilities** (`fetch.ts`):
  - `fetchWithTimeout()` with proper abort signal handling
  - `FetchError` class with `isRetryable()` method
  - `createQueryFn()` and `createMutationFn()` helpers

### 2. Server Actions with Batched Queries
**Location:** `/apps/web/app/app/dashboard/actions/dashboard-data.ts`

Excellent use of `Promise.all()` to batch parallel database queries (lines 150-230), avoiding waterfall requests:
```typescript
const [settings, hasLinks, hasMusicLinks] = await Promise.all([
  // Query 1: User settings
  // Query 2: Social links count
  // Query 3: Music links count
]);
```

### 3. Centralized Cache Invalidation
**Location:** `/apps/web/lib/cache/profile.ts`

Functions like `invalidateProfileCache()`, `invalidateSocialLinksCache()`, and `invalidateAvatarCache()` provide consistent cache busting across both:
- Next.js cache (`revalidateTag`, `revalidatePath`)
- Redis edge cache (`invalidateProfileEdgeCache`)

### 4. Optimistic Updates in Mutations
**Location:** `/apps/web/lib/queries/useDashboardProfileQuery.ts`

The `useUpdateDashboardProfileMutation()` hook demonstrates proper optimistic update pattern with rollback on error.

---

## Issues Identified

### Issue 1: Raw Fetch Calls Not Using React Query (HIGH)

**Files Affected:** 43 files
**Impact:** Missing caching, deduplication, loading states, and error handling

**Examples:**

| File | Pattern | Issue |
|------|---------|-------|
| `SettingsNotificationsSection.tsx` | Manual `useState` for loading/error | Should use `useMutation` |
| `SettingsAppearanceSection.tsx` | No user feedback on error | Silent failures |
| `useLinksPersistence.ts` | Raw fetch for PUT | Should use `useMutation` with optimistic updates |
| `useSuggestionSync.ts` | Raw fetch for PATCH | Mixed pattern (uses React Query for reads only) |
| `UpgradeButton.tsx` | Manual loading state | Could benefit from mutation hook |
| `BillingPortalLink.tsx` | Raw fetch | No caching for billing portal URL |

**Recommendation:** Create dedicated mutation hooks for common operations:
- `useUpdateSettingsMutation()`
- `useSaveLinksMutation()`
- `useAcceptSuggestionMutation()`
- `useCreateCheckoutMutation()`

### Issue 2: Inconsistent Error Handling (MEDIUM)

**Current Patterns (inconsistent):**

1. **Toast notifications** (preferred):
   ```typescript
   toast.error('Failed to save');
   ```

2. **State-based errors** (acceptable):
   ```typescript
   setError(errorMessage);
   ```

3. **Console only** (problematic):
   ```typescript
   console.error('Error saving theme preference:', error);
   // User sees nothing!
   ```

**Files with silent failures:**
- `SettingsAppearanceSection.tsx:29` - Theme save error only logged
- `useProfileTracking.ts` - Tracking errors swallowed

**Recommendation:** Standardize on toast for user-facing errors, with optional state for inline error display.

### Issue 3: Cache Strategy Inconsistency (MEDIUM)

Some hooks inline cache configuration instead of using the defined presets:

**Using presets (correct):**
```typescript
// useDashboardProfileQuery.ts
return useQuery({
  ...STANDARD_CACHE,  // Uses preset
});
```

**Inlining config (inconsistent):**
```typescript
// useBillingStatusQuery.ts:62-65
staleTime: 5 * 60 * 1000,
gcTime: 30 * 60 * 1000,
// Should use ...STANDARD_CACHE instead
```

**Affected Files:**
- `useBillingStatusQuery.ts`
- `useActivityFeedQuery.ts` (custom polling should be explicit override)
- `useSuggestionsQuery.ts`

### Issue 4: Mutation Hooks Underutilized (MEDIUM)

**Current State:** Only 5 files use `useMutation`
- `useCreatorMutations.ts`
- `useDashboardProfileQuery.ts`
- `useDspEnrichmentMutations.ts`
- `QueryProvider.tsx`
- `fetch.ts` (helper only)

**Missing Mutation Hooks For:**
- Social links CRUD (`/api/dashboard/social-links`)
- Settings updates (`/api/dashboard/profile` PUT)
- Stripe checkout (`/api/stripe/checkout`)
- Theme preference save
- Notification preferences

### Issue 5: Missing Optimistic Updates (LOW)

Most mutations that could benefit from optimistic updates don't have them:
- Link reordering
- Suggestion accept/dismiss
- Settings toggles

These cause unnecessary loading states where instant feedback would improve UX.

### Issue 6: Dual Cache Invalidation Overhead (LOW)

Some mutations invalidate both:
1. **Server-side:** `revalidateTag()` / `revalidatePath()`
2. **Client-side:** `queryClient.invalidateQueries()`

While sometimes necessary, this can cause redundant refetches. Consider:
- Using server-side invalidation only when data flows through RSC
- Using client-side invalidation only for client-fetched data

---

## Recommendations

### Priority 1: Create Mutation Hooks for Common Operations

```typescript
// Suggested new hooks in /lib/queries/

// useSettingsMutation.ts
export function useUpdateSettingsMutation() {
  return useMutation({
    mutationFn: createMutationFn('/api/dashboard/profile', 'PUT'),
    onSuccess: () => {
      toast.success('Settings saved');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });
}

// useSocialLinksMutation.ts
export function useSaveLinksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMutationFn('/api/dashboard/social-links', 'PUT'),
    onMutate: async (newLinks) => {
      // Optimistic update
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.socialLinks() });
    },
  });
}
```

### Priority 2: Standardize Error Handling

Create a shared error handler utility:

```typescript
// /lib/queries/error-handler.ts
export function handleMutationError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  toast.error(message);
  console.error(`[Mutation Error] ${fallbackMessage}:`, error);
}
```

### Priority 3: Migrate Cache Strategy Usage

Update hooks to use presets consistently:

```diff
// useBillingStatusQuery.ts
export function useBillingStatusQuery() {
  return useQuery<BillingStatusData>({
    queryKey: queryKeys.billing.status(),
    queryFn: fetchBillingStatus,
-   staleTime: 5 * 60 * 1000,
-   gcTime: 30 * 60 * 1000,
-   refetchOnMount: true,
-   refetchOnWindowFocus: process.env.NODE_ENV === 'production',
+   ...STANDARD_CACHE,
  });
}
```

### Priority 4: Add QueryErrorBoundary Usage

The `QueryErrorBoundary` component exists but isn't widely used. Wrap data-fetching sections:

```typescript
<QueryErrorBoundary fallback={<ErrorState />}>
  <DashboardContent />
</QueryErrorBoundary>
```

---

## Files to Refactor (by priority)

### High Priority (user-facing issues)
1. `components/dashboard/organisms/SettingsAppearanceSection.tsx` - Add error toast
2. `components/dashboard/organisms/SettingsNotificationsSection.tsx` - Use mutation hook
3. `components/dashboard/organisms/links/hooks/useLinksPersistence.ts` - Use mutation with optimistic updates
4. `components/dashboard/organisms/links/hooks/useSuggestionSync.ts` - Convert PATCH calls to mutations

### Medium Priority (consistency improvements)
5. `lib/queries/useBillingStatusQuery.ts` - Use STANDARD_CACHE preset
6. `components/molecules/UpgradeButton.tsx` - Extract to mutation hook
7. `components/molecules/BillingPortalLink.tsx` - Add caching for portal URL

### Lower Priority (nice-to-have)
8. Admin components with raw fetch calls
9. Tracking/analytics fetch calls (can remain fire-and-forget)

---

## Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Files with raw fetch to `/api/*` | 43 | < 15 (admin/tracking OK) |
| Mutation hooks | 5 | 12+ |
| Hooks using cache presets | ~60% | 100% |
| Components with proper error handling | ~70% | 100% |

---

## Completed Improvements (2026-01-20)

The following improvements have been implemented as part of this audit:

### New Files Created

| File | Purpose |
|------|---------|
| `lib/queries/mutation-utils.ts` | Shared error handling utilities (`handleMutationError`, `handleMutationSuccess`, `getErrorMessage`) |
| `lib/queries/useSettingsMutation.ts` | Settings mutation hooks (`useUpdateSettingsMutation`, `useThemeMutation`, `useNotificationSettingsMutation`) |
| `lib/queries/useSocialLinksMutation.ts` | Social links mutation hooks (`useAcceptSuggestionMutation`, `useDismissSuggestionMutation`, `useSuggestionMutations`) |

### Files Updated

| File | Change |
|------|--------|
| `lib/queries/index.ts` | Export new mutation hooks and utilities |
| `lib/queries/useBillingStatusQuery.ts` | Now uses `STANDARD_CACHE` preset instead of inline config |
| `components/dashboard/organisms/SettingsAppearanceSection.tsx` | Now uses `useThemeMutation` hook with error toast |
| `components/dashboard/organisms/SettingsNotificationsSection.tsx` | Now uses `useNotificationSettingsMutation` hook |
| `components/dashboard/organisms/links/hooks/useSuggestionSync.ts` | Now uses mutation hooks instead of raw fetch |

### Impact

- **Error handling:** Settings components now show toast notifications on errors (previously silent)
- **Consistency:** All updated components use the same mutation pattern with automatic cache invalidation
- **Cache strategy:** `useBillingStatusQuery` now uses standardized cache preset
- **Code reduction:** Removed ~80 lines of boilerplate fetch/error handling code

### Updated Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Files with raw fetch to `/api/*` | 43 | 40 | < 15 |
| Mutation hooks | 5 | 8 | 12+ |
| Hooks using cache presets | ~60% | ~70% | 100% |
| Components with proper error handling | ~70% | ~80% | 100% |

---

## Completed Improvements (2026-01-30)

### Cache Strategy Standardization

The following hooks now use standardized cache presets instead of inline configuration:

| File | Change |
|------|--------|
| `lib/queries/usePricingOptionsQuery.ts` | Now uses `...STABLE_CACHE` preset |
| `lib/queries/useNotificationStatusQuery.ts` | Now uses `...STANDARD_CACHE` preset |
| `lib/queries/useDspMatchesQuery.ts` | Now uses `...STANDARD_CACHE` preset |
| `lib/queries/usePublicProfileQuery.ts` | Now uses `...STABLE_CACHE` preset |

### TanStack Pacer Enhancements

| File | Change |
|------|--------|
| `lib/pacer/hooks/timing.ts` | Added rate limiting constants (`HANDLE_CHECK_RATE_LIMIT`, `HANDLE_CHECK_RATE_WINDOW_MS`) |
| `lib/pacer/hooks/useRateLimitedValidation.ts` | New hook for rate-limited async validation (e.g., handle checks) |
| `lib/pacer/hooks/index.ts` | Export new `useRateLimitedValidation` hook |

### Updated Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Files with raw fetch to `/api/*` | 40 | 40 | < 15 |
| Mutation hooks | 8 | 10 | 12+ |
| Hooks using cache presets | ~70% | ~85% | 100% |
| Components with proper error handling | ~80% | ~80% | 100% |

---

## Remaining Next Steps

1. ~~Implement mutation hooks for settings and links~~ ✅
2. ~~Add error toasts to silent failure components~~ ✅
3. Update existing hooks to use cache presets (~85% complete, see metrics)
4. Refactor `useLinksPersistence.ts` to use mutation hooks for link saving
5. ~~Create mutation hook for `UpgradeButton.tsx`~~ ✅ (uses `useCheckoutMutation`)
6. ~~Create mutation hook for `BillingPortalLink.tsx`~~ ✅ (uses `usePortalMutation`)
7. Add QueryErrorBoundary to dashboard sections
8. Continue migrating remaining raw fetch calls to mutation hooks
9. Consider using `useRateLimitedValidation` for handle checks to prevent API abuse

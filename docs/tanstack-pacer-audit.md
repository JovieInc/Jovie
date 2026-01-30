# TanStack Pacer Audit Report

**Last Updated:** 2026-01-30
**Package Version:** `@tanstack/react-pacer` ^0.19.3

---

## Executive Summary

The Jovie codebase has a well-structured TanStack Pacer integration with centralized modules, consistent timing constants, and custom application hooks. Previous audit items have been addressed, including cache utilities, error handling, and PacerProvider integration. This update identifies new improvement opportunities.

---

## Current Architecture

### Centralized Module Structure

```
apps/web/lib/pacer/
├── index.ts                    # Re-exports all TanStack Pacer + custom hooks
├── cache.ts                    # TTL/size-limited cache utility ✅
├── errors.ts                   # Standardized error handling ✅
└── hooks/
    ├── index.ts                # Barrel exports
    ├── timing.ts               # Centralized timing constants
    ├── useAsyncValidation.ts   # Debounced async API validation
    ├── useAsyncSearch.ts       # Debounced search with loading states
    ├── useAutoSave.ts          # Debounced auto-save
    ├── useThrottledEventHandler.ts
    └── useThrottledScroll.ts   # 60fps scroll tracking
```

### Timing Constants (lib/pacer/hooks/timing.ts)

```typescript
PACER_TIMING = {
  DEBOUNCE_MS: 300,           // General debounce
  SEARCH_DEBOUNCE_MS: 300,    // Search inputs
  VALIDATION_DEBOUNCE_MS: 450, // Async validation
  SAVE_DEBOUNCE_MS: 500,      // Auto-save (overridden to 900ms in settings)
  THROTTLE_MS: 100,           // Default throttle
  SCROLL_THROTTLE_MS: 16,     // Scroll/animation (60fps)
  VALIDATION_TIMEOUT_MS: 5000, // Validation timeout
}
```

### PacerProvider Integration ✅

Global defaults are configured in `CoreProviders.tsx`:

```typescript
<PacerProvider
  defaultOptions={{
    debouncer: { wait: PACER_TIMING.DEBOUNCE_MS },
    throttler: { wait: PACER_TIMING.THROTTLE_MS, leading: true, trailing: true },
  }}
>
```

### Usage Locations

| Feature | File | Hook Used |
| --------- | ------ | ----------- |
| Artist Search | `lib/queries/useArtistSearchQuery.ts` | `useAsyncDebouncer` (direct) |
| Table Search | `components/organisms/table/molecules/TableSearchBar.tsx` | `useDebouncer` (direct) |
| Handle Validation | `components/organisms/smart-handle-input/useHandleApiValidation.ts` | `useAsyncValidation` |
| Handle Claim | `components/home/claim-handle/useHandleValidation.ts` | `useAsyncValidation` |
| Profile Auto-save | `components/dashboard/organisms/settings-profile-section/useSettingsProfile.ts` | `useAutoSave` |
| Links Persistence | `components/dashboard/organisms/links/hooks/useLinksPersistence.ts` | `useAsyncDebouncer` (direct) |
| Profile Editor | `components/dashboard/organisms/links/hooks/useProfileEditor.ts` | `useAutoSave` |
| Sorting Manager | `components/dashboard/organisms/release-provider-matrix/hooks/useSortingManager.ts` | `useDebouncer` (direct) |
| Marketing Header | `components/site/MarketingHeader.tsx` | `useThrottledScroll` |
| Parallax Animation | `components/home/FeaturedArtistsDriftRow.tsx` | `useThrottler` (direct) |
| Chat Submission | `components/jovie/JovieChat.tsx` | `useThrottledCallback` |

---

## Issues Identified (Updated 2026-01-30)

### 1. **Direct TanStack Pacer Usage Instead of Centralized Hooks** ⚠️ NEW

Several components bypass the centralized hooks and use TanStack Pacer directly:

| Component | Current Usage | Recommended |
| ----------- | -------------- | ------------- |
| `useArtistSearchQuery.ts:124` | Direct `useAsyncDebouncer` | Use `useAsyncSearch` hook |
| `useLinksPersistence.ts:350` | Direct `useAsyncDebouncer` + custom flush | Use `useAutoSave` hook |
| `TableSearchBar.tsx:36` | Direct `useDebouncer` | Create `useDebouncedInput` hook |
| `useSortingManager.ts` | Direct `useDebouncer` | Use centralized timing |
| `FeaturedArtistsDriftRow.tsx` | Direct `useThrottler` | Use `useThrottledScroll` |

**Impact:** Code duplication, inconsistent patterns, harder to maintain.

### 2. **Rate Limiting vs Throttling Misuse** ⚠️ NEW

**Location:** `components/jovie/JovieChat.tsx:150`

```typescript
// Current - uses throttle for API rate limiting
const throttledSubmit = useThrottledCallback(doSubmit, {
  wait: SUBMIT_THROTTLE_MS, // 1000ms
  leading: true,
  trailing: false,
});
```

**Problem:** Throttling allows immediate first call, then blocks for `wait` ms. For API rate limiting, `useRateLimiter` with a token bucket approach is more appropriate.

**Impact:** Could allow burst requests under certain conditions.

### 3. **Missing Retry Logic for Network Operations** ⚠️ NEW

Network failures don't have automatic retry. Affected operations:

- Handle availability checks (`useAsyncValidation`)
- Artist search queries (`useArtistSearchQuery`)
- Auto-save operations (`useAutoSave`, `useLinksPersistence`)
- Links persistence (`useLinksPersistence`)

`AsyncRetryer` is exported but never used.

### 4. **Hardcoded Timing Values** ⚠️ NEW

Several files use hardcoded timing values instead of `PACER_TIMING`:

| Location | Hardcoded Value | Should Use |
| ---------- | ----------------- | ------------ |
| `useLinksPersistence.ts:124` | `500` | `PACER_TIMING.SAVE_DEBOUNCE_MS` |
| `useSortingManager.ts` | `150` | New `PACER_TIMING.SORT_DEBOUNCE_MS` |
| `useSettingsProfile.ts` | `900` | New `PACER_TIMING.PROFILE_SAVE_DEBOUNCE_MS` |
| `JovieChat.tsx:38` | `1000` | New `PACER_TIMING.CHAT_RATE_LIMIT_MS` |

### 5. **Unused TanStack Pacer Features**

The re-export file includes many unused capabilities:

| Feature | Exported | Used | Potential Use Case |
| --------- | ---------- | ------ | ------------------- |
| `useRateLimiter`, `useAsyncRateLimiter` | ✅ | ❌ | API call rate limiting (chat, validation) |
| `AsyncRetryer` | ✅ | ❌ | Network failure recovery |
| `useBatcher`, `useAsyncBatcher` | ✅ | ❌ | Bulk link saves |
| `useQueuer`, `useAsyncQueuer` | ✅ | ❌ | Sequential operation guarantees |
| `useDebouncedValue`, `useThrottledValue` | ✅ | ❌ | Simpler state patterns |

### 6. **Incomplete PacerProvider Configuration**

**Location:** `CoreProviders.tsx:136-144`

```typescript
<PacerProvider
  defaultOptions={{
    debouncer: { wait: PACER_TIMING.DEBOUNCE_MS },
    throttler: { wait: PACER_TIMING.THROTTLE_MS, leading: true, trailing: true },
    // Missing: rateLimiter, queuer, batcher defaults
  }}
>
```

### 7. **Error Handling Gaps in Direct Usages**

Not all TanStack Pacer usages leverage the centralized error utilities from `/lib/pacer/errors.ts`:

| File | Uses `isAbortError` | Uses `formatPacerError` |
| ------ | --------------------- | ------------------------ |
| `useAsyncValidation.ts` | ✅ | ❌ |
| `useAsyncSearch.ts` | ✅ | ❌ |
| `useArtistSearchQuery.ts` | ❌ | ❌ |
| `useLinksPersistence.ts` | ❌ | ❌ |

### 8. **Duplicate Auto-Save Pattern in useLinksPersistence**

`useLinksPersistence.ts:359-380` implements its own debounce+flush+cancel pattern:

```typescript
const debouncedSave = useMemo(() => {
  const fn = (input: LinkItem[]) => {
    lastInputRef.current = input;
    asyncDebouncer.maybeExecute(input);
  };
  fn.cancel = () => { /* ... */ };
  fn.flush = () => { /* ... */ };
  return fn;
}, [asyncDebouncer, enqueueSave]);
```

This duplicates `useAutoSave` functionality. The optimistic locking could be extracted separately.

---

## Enhancement Recommendations

### High Priority

#### 1. Replace Throttle with Rate Limiter for Chat

**File:** `components/jovie/JovieChat.tsx`

```typescript
// Current (suboptimal for API rate limiting)
const throttledSubmit = useThrottledCallback(doSubmit, {
  wait: SUBMIT_THROTTLE_MS,
  leading: true,
  trailing: false,
});

// Recommended
import { useAsyncRateLimiter } from '@/lib/pacer';

const rateLimitedSubmit = useAsyncRateLimiter(doSubmit, {
  limit: 1,
  window: PACER_TIMING.CHAT_RATE_LIMIT_MS,
  onRateLimited: () => setChatError({ message: 'Please wait before sending another message' }),
});
```

#### 2. Add Retry Logic with Exponential Backoff

Create a `useAsyncValidationWithRetry` wrapper:

```typescript
// lib/pacer/hooks/useAsyncValidationWithRetry.ts
import { AsyncRetryer, isNetworkError } from '@tanstack/react-pacer';

export function useAsyncValidationWithRetry<TValue, TResult>(
  options: UseAsyncValidationOptions<TValue, TResult> & {
    maxRetries?: number;
    backoffMs?: number;
  }
) {
  const { validatorFn, maxRetries = 3, backoffMs = 1000, ...rest } = options;

  const retryingValidatorFn = useCallback(
    async (value: TValue, signal: AbortSignal) => {
      const retryer = new AsyncRetryer(
        () => validatorFn(value, signal),
        {
          maxRetries,
          initialDelay: backoffMs,
          backoffFactor: 2,
          retryIf: (err) => isNetworkError(err) && !signal.aborted,
        }
      );
      return retryer.execute();
    },
    [validatorFn, maxRetries, backoffMs]
  );

  return useAsyncValidation({ ...rest, validatorFn: retryingValidatorFn });
}
```

#### 3. Consolidate Timing Constants

Add missing constants to `lib/pacer/hooks/timing.ts`:

```typescript
export const PACER_TIMING = {
  // Existing
  DEBOUNCE_MS: 300,
  SEARCH_DEBOUNCE_MS: 300,
  VALIDATION_DEBOUNCE_MS: 450,
  SAVE_DEBOUNCE_MS: 500,
  THROTTLE_MS: 100,
  SCROLL_THROTTLE_MS: 16,
  VALIDATION_TIMEOUT_MS: 5000,

  // New
  SORT_DEBOUNCE_MS: 150,           // Table sorting
  PROFILE_SAVE_DEBOUNCE_MS: 900,   // Profile auto-save (slower)
  CHAT_RATE_LIMIT_MS: 1000,        // Chat submission rate limit
} as const;
```

#### 4. Migrate Direct Usages to Centralized Hooks

| File | Action |
| ------ | -------- |
| `useArtistSearchQuery.ts` | Consider using `useAsyncSearch` or document why TanStack Query is preferred |
| `useLinksPersistence.ts` | Refactor to use `useAutoSave` with extracted versioning logic |
| `TableSearchBar.tsx` | Create `useDebouncedInput` hook for input state sync pattern |
| `useSortingManager.ts` | Use `PACER_TIMING.SORT_DEBOUNCE_MS` |

### Medium Priority

#### 5. Update Error Handling in Direct Usages

Import error utilities from centralized module:

```typescript
// In useArtistSearchQuery.ts, useLinksPersistence.ts
import { isAbortError, isNetworkError, formatPacerError } from '@/lib/pacer';
```

#### 6. Create useDebouncedInput Hook

For the common pattern of syncing local and external state with debouncing:

```typescript
// lib/pacer/hooks/useDebouncedInput.ts
export function useDebouncedInput(
  externalValue: string,
  onChange: (value: string) => void,
  options?: { wait?: number }
) {
  const [localValue, setLocalValue] = useState(externalValue);
  const debouncer = useDebouncer(onChange, { wait: options?.wait ?? PACER_TIMING.DEBOUNCE_MS });

  useEffect(() => setLocalValue(externalValue), [externalValue]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    debouncer.maybeExecute(newValue);
  }, [debouncer]);

  return { value: localValue, onChange: handleChange };
}
```

#### 7. Extend PacerProvider Defaults

```typescript
// CoreProviders.tsx
<PacerProvider
  defaultOptions={{
    debouncer: { wait: PACER_TIMING.DEBOUNCE_MS },
    throttler: { wait: PACER_TIMING.THROTTLE_MS, leading: true, trailing: true },
    rateLimiter: { limit: 5, window: 1000 },  // 5 requests per second
    queuer: { maxSize: 100 },
  }}
>
```

### Low Priority

#### 8. Add Proactive Cache Cleanup

```typescript
// lib/pacer/hooks/useCacheCleanup.ts
export function useCacheCleanup(
  cache: ValidationCache<unknown, unknown>,
  intervalMs = 60_000
) {
  useEffect(() => {
    const id = setInterval(() => cache.size(), intervalMs);
    return () => clearInterval(id);
  }, [cache, intervalMs]);
}
```

#### 9. Consider Batching for Bulk Link Operations

If bulk operations become common:

```typescript
const linkBatcher = useAsyncBatcher(
  async (links: LinkItem[]) => await bulkSaveLinks(links),
  { maxSize: 10, wait: 100 }
);
```

#### 10. Add Debug Mode for Development

```typescript
// lib/pacer/debug.ts
export const PACER_DEBUG = process.env.NODE_ENV === 'development';

if (PACER_DEBUG) {
  console.log('[Pacer] Debounce triggered:', { value, wait });
}
```

---

## Migration Checklist

### Previously Completed ✅

- [x] Consolidate `useDebouncedValue.ts` into `lib/pacer/hooks.ts`
- [x] Create shared cache utility with TTL/size limits (`lib/pacer/cache.ts`)
- [x] Implement `PacerProvider` in app root (`CoreProviders.tsx`)
- [x] Create `lib/pacer/errors.ts` for standardized error handling
- [x] Remove legacy constant exports
- [x] Add `{ passive: true }` to resize listener in FeaturedArtistsDriftRow
- [x] Create rate limiting hook for handle validation (`lib/pacer/hooks/useRateLimitedValidation.ts`)

### New Items

- [ ] Migrate handle validation to use `useRateLimitedValidation` hook
- [ ] Replace `useThrottledCallback` with `useRateLimiter` in JovieChat
- [ ] Add retry logic wrapper using `AsyncRetryer`
- [ ] Add missing timing constants (`SORT_DEBOUNCE_MS`, `PROFILE_SAVE_DEBOUNCE_MS`, `CHAT_RATE_LIMIT_MS`)
- [ ] Migrate hardcoded timing values to use `PACER_TIMING`
- [ ] Create `useDebouncedInput` hook for input state pattern
- [ ] Refactor `useLinksPersistence` to use `useAutoSave`
- [ ] Update direct usages to import from `/lib/pacer/errors`
- [ ] Document why `useArtistSearchQuery` uses direct debouncer vs `useAsyncSearch`

---

## Metrics to Track

| Metric | Current | Target |
| -------- | --------- | -------- |
| Direct TanStack Pacer imports | 7 files | 0 files (all via centralized hooks) |
| Hardcoded timing values | 4 locations | 0 locations |
| Error handling coverage | 40% | 100% |
| Unused exported features | 8 features | 4 features (after implementing rate limiter, retryer) |

---

## Conclusion

The TanStack Pacer integration is well-architected with good centralization, caching, and error handling foundations. The main opportunities are:

1. **Correctness**: Use rate limiting instead of throttling for API calls
2. **Robustness**: Add retry logic for network failures
3. **Consistency**: Migrate direct usages to centralized hooks
4. **Maintainability**: Consolidate timing constants and duplicate implementations

Implementing the high-priority items would significantly improve reliability and reduce code duplication across the codebase.

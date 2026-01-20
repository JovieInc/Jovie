# TanStack Pacer Audit Report

## Executive Summary

The Jovie codebase has a well-structured TanStack Pacer integration with centralized modules, consistent timing constants, and custom application hooks. However, there are opportunities to improve consistency, reduce duplication, leverage unused features, and enhance error handling.

**Package Version:** `@tanstack/react-pacer` ^0.19.3

---

## Current Architecture

### Centralized Module Structure

```
apps/web/lib/pacer/
├── index.ts    # Re-exports all TanStack Pacer + custom hooks
└── hooks.ts    # Application-specific hooks (6 custom hooks)
```

### Timing Constants (lib/pacer/hooks.ts:18-33)

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

### Usage Locations

| Feature | File | Hook Used |
|---------|------|-----------|
| Artist Search | `lib/queries/useArtistSearchQuery.ts` | `useAsyncDebouncer` |
| Table Search | `components/organisms/table/molecules/TableSearchBar.tsx` | `useDebouncer` |
| Handle Validation | `components/organisms/smart-handle-input/useHandleApiValidation.ts` | `useAsyncValidation` |
| Handle Claim | `components/home/claim-handle/useHandleValidation.ts` | `useAsyncValidation` |
| Profile Auto-save | `components/dashboard/organisms/settings-profile-section/useSettingsProfile.ts` | `useAutoSave` |
| Marketing Header | `components/site/MarketingHeader.tsx` | `useThrottledScroll` |
| Parallax Animation | `components/home/FeaturedArtistsDriftRow.tsx` | `useThrottler` |

---

## Issues Identified

### 1. **Duplicate Debounce Implementations**

**Problem:** Two separate debounce hook files exist with overlapping functionality.

| File | Exports |
|------|---------|
| `lib/pacer/hooks.ts` | `useAsyncValidation`, `useAsyncSearch`, `useAutoSave` |
| `hooks/useDebouncedValue.ts` | `useDebouncedValue`, `useDebouncedCallback`, `useSearch` |

**Impact:** Confusion about which hook to use; `useSearch` in `useDebouncedValue.ts` overlaps with `useAsyncSearch`.

### 2. **Legacy Exports Bloat**

**Location:** `lib/pacer/hooks.ts:35-41`

```typescript
// Legacy exports for backwards compatibility
export const DEFAULT_DEBOUNCE_MS = PACER_TIMING.DEBOUNCE_MS;
export const DEFAULT_SEARCH_DEBOUNCE_MS = PACER_TIMING.SEARCH_DEBOUNCE_MS;
// ...more
```

These duplicate the `PACER_TIMING` object values and add unnecessary API surface.

### 3. **Redundant Cache Implementations**

**Problem:** Multiple hooks implement their own caching:

- `useAsyncValidation` (hooks.ts:112): `cacheRef.current = new Map()`
- `useHandleApiValidation.ts:49`: `lastValidatedRef`
- `useSettingsProfile.ts:73`: `lastProfileSavedRef`

No cache invalidation strategy, TTL, or size limits exist.

### 4. **Inconsistent Error Handling**

**Pattern A** (useAsyncValidation):
```typescript
if (err instanceof Error && err.name === 'AbortError') {
  return undefined;
}
```

**Pattern B** (useHandleApiValidation):
```typescript
if (err.message === 'AbortError' || err.name === 'AbortError') {
  errorMessage = 'Check timed out - please try again';
}
```

Timeout aborts are confused with manual cancellation.

### 5. **Unused TanStack Pacer Features**

The re-export file includes many unused capabilities:

| Feature | Exported | Used |
|---------|----------|------|
| Rate Limiting | ✅ `useRateLimiter`, `useAsyncRateLimiter` | ❌ |
| Batching | ✅ `useBatcher`, `useAsyncBatcher` | ❌ |
| Queuing | ✅ `useQueuer`, `useAsyncQueuer` | ❌ |
| Retry | ✅ `AsyncRetryer` | ❌ |
| Provider | ✅ `PacerProvider` | ❌ |

### 6. **Missing AbortController Cleanup in flush()**

**Location:** `lib/pacer/hooks.ts:531-547` (useAutoSave.flush)

```typescript
const flush = useCallback(async () => {
  if (pendingDataRef.current !== null) {
    asyncDebouncer.cancel();
    try {
      await saveFn(pendingDataRef.current); // No AbortSignal passed
      // ...
    }
  }
}, [asyncDebouncer, saveFn, onSuccess, onError]);
```

The `saveFn` doesn't receive an AbortSignal, making cancellation impossible during flush.

### 7. **Non-Passive Resize Listener**

**Location:** `FeaturedArtistsDriftRow.tsx:85`

```typescript
window.addEventListener('resize', onScrollOrResize); // No { passive: true }
```

Unlike the scroll listener, the resize listener isn't marked as passive.

---

## Enhancement Recommendations

### High Priority

#### 1. Consolidate Debounce Hooks

**Action:** Merge `hooks/useDebouncedValue.ts` into `lib/pacer/hooks.ts` or deprecate it.

```typescript
// In lib/pacer/index.ts - add explicit re-exports
export { useDebouncedValue, useDebouncedCallback } from '@tanstack/react-pacer';

// Deprecate the custom useSearch in favor of useAsyncSearch
```

#### 2. Create Unified Cache Utility

```typescript
// lib/pacer/cache.ts
export interface CacheOptions {
  ttlMs?: number;
  maxSize?: number;
}

export function createValidationCache<K, V>(options: CacheOptions = {}) {
  const { ttlMs = 60_000, maxSize = 100 } = options;
  const cache = new Map<K, { value: V; timestamp: number }>();

  return {
    get(key: K): V | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: K, value: V): void {
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(key, { value, timestamp: Date.now() });
    },
    invalidate(key: K): void {
      cache.delete(key);
    },
    clear(): void {
      cache.clear();
    },
  };
}
```

#### 3. Implement PacerProvider for Global Defaults

```typescript
// app/providers.tsx
import { PacerProvider } from '@/lib/pacer';

export function Providers({ children }) {
  return (
    <PacerProvider
      options={{
        debounce: { wait: 300 },
        throttle: { wait: 100, leading: true, trailing: true },
      }}
    >
      {children}
    </PacerProvider>
  );
}
```

This allows hooks to inherit defaults without repeating configuration.

#### 4. Standardize Error Handling

```typescript
// lib/pacer/errors.ts
export function isAbortError(err: unknown): boolean {
  return err instanceof Error &&
    (err.name === 'AbortError' || err.message === 'AbortError');
}

export function isTimeoutError(err: unknown, signal?: AbortSignal): boolean {
  return isAbortError(err) && signal?.aborted === true;
}

export function formatPacerError(err: unknown): string {
  if (isAbortError(err)) return 'Request cancelled';
  if (err instanceof Error) {
    if (err.message.includes('fetch')) return 'Connection failed';
    if (err.message.includes('HTTP')) return 'Server error';
    return err.message;
  }
  return 'Unknown error';
}
```

### Medium Priority

#### 5. Add Rate Limiting for API Endpoints

Use the already-exported rate limiter for expensive operations:

```typescript
// Example: Rate limit handle checks to 10 per minute
const handleCheckLimiter = useAsyncRateLimiter(
  async (handle: string, signal: AbortSignal) => {
    return await checkHandleAvailability(handle, signal);
  },
  {
    limit: 10,
    window: 60_000,
    onRateLimited: () => {
      notifications.warning('Too many requests, please slow down');
    },
  }
);
```

#### 6. Add Retry Logic with Exponential Backoff

For network-sensitive operations:

```typescript
import { AsyncRetryer } from '@/lib/pacer';

const retryer = new AsyncRetryer(saveFn, {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  retryIf: (error) => error.message.includes('network'),
});
```

#### 7. Remove Legacy Exports

Replace:
```typescript
// Old
import { DEFAULT_DEBOUNCE_MS } from '@/lib/pacer/hooks';

// New
import { PACER_TIMING } from '@/lib/pacer/hooks';
const wait = PACER_TIMING.DEBOUNCE_MS;
```

Then remove the legacy constants after migration.

#### 8. Add Passive Flag to Resize Listener

```typescript
// FeaturedArtistsDriftRow.tsx:85
window.addEventListener('resize', onScrollOrResize, { passive: true });
```

### Low Priority

#### 9. Add Batching for Bulk Operations

If future features require batch API calls (e.g., bulk updates):

```typescript
const batcher = useAsyncBatcher(
  async (items: Item[]) => {
    return await bulkUpdateItems(items);
  },
  {
    maxSize: 10,
    wait: 100,
  }
);
```

#### 10. Consider Queuing for Sequential Operations

For operations that must execute in order:

```typescript
const queuer = useAsyncQueuer<() => Promise<void>>({
  concurrency: 1,
  started: true,
});
```

#### 11. Add Debug Mode for Development

```typescript
// lib/pacer/debug.ts
export const PACER_DEBUG = process.env.NODE_ENV === 'development';

// In hooks, add logging when PACER_DEBUG is true
if (PACER_DEBUG) {
  console.log('[Pacer] Debounce triggered:', { value, wait });
}
```

---

## Migration Checklist

- [x] Consolidate `useDebouncedValue.ts` into `lib/pacer/hooks.ts` ✅ **DONE**
- [x] Create shared cache utility with TTL/size limits ✅ **DONE** (`lib/pacer/cache.ts`)
- [x] Implement `PacerProvider` in app root ✅ **DONE** (added to `ClientProviders.tsx`)
- [x] Create `lib/pacer/errors.ts` for standardized error handling ✅ **DONE**
- [x] Remove legacy constant exports after codebase migration ✅ **DONE**
- [x] Add `{ passive: true }` to resize listener in FeaturedArtistsDriftRow ✅ **DONE**
- [ ] Consider rate limiting for `/api/handle/check` endpoint
- [ ] Evaluate retry logic for auto-save operations

---

## Metrics to Track

After implementing enhancements:

1. **API Call Reduction:** Measure decrease in `/api/handle/check` calls with improved caching
2. **Error Rate:** Track validation timeout/failure rates
3. **UX Latency:** Measure time-to-feedback for search and validation
4. **Bundle Size:** Ensure unused Pacer exports are tree-shaken

---

## Conclusion

The current TanStack Pacer integration is solid but has room for improvement. The highest-impact changes are:

1. **Consolidating duplicate hooks** - reduces confusion and maintenance burden
2. **Implementing shared caching** - improves performance and consistency
3. **Using PacerProvider** - simplifies configuration
4. **Standardizing error handling** - improves user experience

The unused features (rate limiting, batching, queuing, retry) represent opportunities for future enhancements as the application scales.

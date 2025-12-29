/**
 * Request Deduplication Module
 *
 * Provides utilities and hooks for deduplicated data fetching.
 * Use these instead of raw fetch() to prevent duplicate API calls.
 *
 * @example
 * ```tsx
 * // In a client component
 * import { useDedupedFetch } from '@/lib/fetch';
 *
 * function MyComponent() {
 *   const { data, loading, error, refresh } = useDedupedFetch('/api/data');
 *   // ...
 * }
 *
 * // Direct fetch (non-React)
 * import { dedupedFetch } from '@/lib/fetch';
 *
 * const data = await dedupedFetch('/api/data');
 * ```
 */

export {
  clearCache,
  type DedupedFetchOptions,
  type DedupedFetchResult,
  dedupedFetch,
  dedupedFetchWithMeta,
  FetchError,
  getCacheStats,
  invalidateCache,
  invalidateCacheMatching,
  prefetch,
} from './deduped-fetch';

export {
  type UseDedupedFetchActions,
  type UseDedupedFetchHookOptions,
  type UseDedupedFetchReturn,
  type UseDedupedFetchState,
  useDedupedFetch,
  useDedupedFetchAll,
} from './use-deduped-fetch';

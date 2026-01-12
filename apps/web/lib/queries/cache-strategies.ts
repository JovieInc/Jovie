import type { UseQueryOptions } from '@tanstack/react-query';

/**
 * Cache strategy presets for different data types.
 *
 * These presets provide consistent caching behavior across the app
 * based on how frequently data changes and how critical freshness is.
 *
 * Architecture:
 * - Public profiles: Use Next.js SSR (unstable_cache + ISR) for fast TTFB
 * - App data: Use these TanStack Query strategies for client caching
 */

// Time constants
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Real-time data that should always be fresh.
 * Use for: notifications, live activity feeds, real-time analytics
 *
 * **IMPORTANT: Polling control**
 * This preset enables 30s polling via `refetchInterval`. To avoid unnecessary
 * CPU/memory usage, callers MUST control polling in their useQuery calls:
 *
 * @example
 * // Option 1: Disable query when not needed (stops all fetching including polling)
 * useQuery({
 *   ...REALTIME_CACHE,
 *   queryKey: [...],
 *   queryFn: ...,
 *   enabled: isTabVisible && isComponentMounted,
 * });
 *
 * @example
 * // Option 2: Dynamically disable polling while keeping query active
 * useQuery({
 *   ...REALTIME_CACHE,
 *   queryKey: [...],
 *   queryFn: ...,
 *   refetchInterval: isPaused ? false : 30 * 1000,
 * });
 */
export const REALTIME_CACHE: Partial<UseQueryOptions> = {
  staleTime: 0, // Always stale
  gcTime: 5 * MINUTE,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchInterval: 30 * SECOND, // Poll every 30s - see JSDoc for control guidance
};

/**
 * Frequently changing data that benefits from short cache.
 * Use for: dashboard stats, recent activity, billing status
 */
export const FREQUENT_CACHE: Partial<UseQueryOptions> = {
  staleTime: 1 * MINUTE,
  gcTime: 10 * MINUTE,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
};

/**
 * Standard app data with balanced freshness/performance.
 * Use for: user profile, settings, links list
 * This is the default strategy.
 */
export const STANDARD_CACHE: Partial<UseQueryOptions> = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnMount: true,
  refetchOnWindowFocus: process.env.NODE_ENV === 'production',
};

/**
 * Slowly changing data that can be cached longer.
 * Use for: feature flags, app config, creator profiles list
 */
export const STABLE_CACHE: Partial<UseQueryOptions> = {
  staleTime: 15 * MINUTE,
  gcTime: 1 * HOUR,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
};

/**
 * Static reference data that rarely changes.
 * Use for: categories, platform lists, static content
 *
 * Note: gcTime is set longer than staleTime to provide a buffer window
 * for unmount/remount scenarios without losing cached data.
 */
export const STATIC_CACHE: Partial<UseQueryOptions> = {
  staleTime: 1 * HOUR,
  gcTime: 2 * HOUR,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

/**
 * Cache strategy for paginated and infinite scroll queries.
 * Use for: useInfiniteQuery, paginated tables, cursor-based lists
 *
 * Avoids refetching entire datasets on mount/focus which would
 * reset scroll position and cause jarring UX.
 */
export const PAGINATED_CACHE: Partial<UseQueryOptions> = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnMount: false, // Don't refetch entire list on mount
  refetchOnWindowFocus: false,
};

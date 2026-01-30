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
 * Helper type for cache strategy options.
 * Uses plain object to avoid TypeScript inference issues with spreads.
 */
interface CacheStrategyOptions {
  staleTime?: number;
  gcTime?: number;
  refetchOnMount?: boolean | 'always';
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
}

/**
 * Real-time data that should always be fresh.
 * Use for: notifications, live activity feeds, real-time analytics
 *
 * **Polling is opt-in:** Add `refetchInterval` explicitly if needed.
 *
 * @example
 * // Without polling (default) - refetches on mount and focus only
 * useQuery({
 *   ...REALTIME_CACHE,
 *   queryKey: [...],
 *   queryFn: ...,
 * });
 *
 * @example
 * // With polling - add refetchInterval explicitly
 * useQuery({
 *   ...REALTIME_CACHE,
 *   queryKey: [...],
 *   queryFn: ...,
 *   refetchInterval: 30 * 1000, // Poll every 30s
 * });
 */
export const REALTIME_CACHE: CacheStrategyOptions = {
  staleTime: 0, // Always stale
  gcTime: 5 * MINUTE,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  // Note: refetchInterval is opt-in - add explicitly if polling is needed
  refetchIntervalInBackground: false,
};

/**
 * Frequently changing data that benefits from short cache.
 * Use for: dashboard stats, recent activity, billing status
 */
export const FREQUENT_CACHE: CacheStrategyOptions = {
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
export const STANDARD_CACHE: CacheStrategyOptions = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnMount: true,
  refetchOnWindowFocus: process.env.NODE_ENV === 'production',
};

/**
 * Slowly changing data that can be cached longer.
 * Use for: feature flags, app config, creator profiles list
 */
export const STABLE_CACHE: CacheStrategyOptions = {
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
export const STATIC_CACHE: CacheStrategyOptions = {
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
export const PAGINATED_CACHE: CacheStrategyOptions = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnMount: false, // Don't refetch entire list on mount
  refetchOnWindowFocus: false,
};

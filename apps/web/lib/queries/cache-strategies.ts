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
 */
export const REALTIME_CACHE: Partial<UseQueryOptions> = {
  staleTime: 0, // Always stale
  gcTime: 5 * MINUTE,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchInterval: 30 * SECOND, // Poll every 30s
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
 */
export const STATIC_CACHE: Partial<UseQueryOptions> = {
  staleTime: 1 * HOUR,
  gcTime: 24 * HOUR,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

/**
 * Infinite/paginated data strategy.
 * Use for: infinite scroll lists, paginated tables
 */
export const INFINITE_CACHE: Partial<UseQueryOptions> = {
  staleTime: 5 * MINUTE,
  gcTime: 30 * MINUTE,
  refetchOnMount: false, // Don't refetch entire list on mount
  refetchOnWindowFocus: false,
};

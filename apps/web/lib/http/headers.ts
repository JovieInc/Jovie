/**
 * Common HTTP response headers for API routes
 *
 * Centralized header constants to avoid duplication across API routes.
 */

/**
 * Headers to prevent caching of API responses
 * Use for dynamic data that should always be fresh
 */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Common cache control header presets
 */
export const CACHE_HEADERS = {
  /** No caching - for dynamic/personalized content */
  noStore: NO_STORE_HEADERS,

  /** Short cache for semi-dynamic content (1 minute) */
  shortCache: { 'Cache-Control': 'public, max-age=60' } as const,

  /** Medium cache for less frequently changing content (5 minutes) */
  mediumCache: { 'Cache-Control': 'public, max-age=300' } as const,

  /** Long cache for static content (1 hour) */
  longCache: { 'Cache-Control': 'public, max-age=3600' } as const,
} as const;

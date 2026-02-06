/**
 * Centralized HTTP header constants for API routes.
 * Use these instead of defining headers inline to ensure consistency.
 */

// ============================================================================
// Cache Control Headers
// ============================================================================

/**
 * Headers to disable caching entirely.
 * Use for dynamic API responses that should never be cached.
 */
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

/**
 * Headers to disable caching with additional directives.
 * Use for sensitive data that must never be cached or stored.
 */
export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Headers for short-term caching (1 minute).
 * Use for semi-dynamic data that can tolerate brief staleness.
 */
export const SHORT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
} as const;

/**
 * Headers for medium-term caching (5 minutes).
 * Use for data that changes infrequently.
 */
export const MEDIUM_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
} as const;

/**
 * Headers for long-term caching (1 hour).
 * Use for rarely changing data like static configurations.
 */
export const LONG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
} as const;

/**
 * Headers for immutable content (1 year).
 * Use for versioned assets or content with hash-based URLs.
 */
export const IMMUTABLE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
} as const;

// ============================================================================
// Security Headers
// ============================================================================

/**
 * Common security headers for API responses.
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
} as const;

// ============================================================================
// CORS Headers
// ============================================================================

/**
 * Allowed origins for authenticated API endpoints.
 * In production, this should be restricted to your app's domains.
 */
const ALLOWED_ORIGINS = [
  'https://jovie.fm',
  'https://www.jovie.fm',
  'https://app.jovie.fm',
  // Preview deployments
  /^https:\/\/jovie-.*\.vercel\.app$/,
] as const;

/**
 * Validates if an origin is allowed.
 */
function isAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;

  for (const allowed of ALLOWED_ORIGINS) {
    if (typeof allowed === 'string') {
      if (origin === allowed) return origin;
    } else if (allowed.test(origin)) {
      return origin;
    }
  }

  // In development, allow localhost origins
  if (
    process.env.NODE_ENV === 'development' &&
    (origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:'))
  ) {
    return origin;
  }

  return null;
}

/**
 * Creates CORS headers for authenticated endpoints.
 * Validates the origin against allowed origins instead of using wildcard.
 */
export function createAuthenticatedCorsHeaders(
  requestOrigin: string | null
): Record<string, string> {
  const validatedOrigin = isAllowedOrigin(requestOrigin);
  if (!validatedOrigin) {
    // Return empty object - no CORS headers means browser will block
    return {};
  }

  return {
    'Access-Control-Allow-Origin': validatedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * CORS headers for public API endpoints.
 * Use createAuthenticatedCorsHeaders for authenticated endpoints.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const;

// ============================================================================
// Timeouts and TTLs
// ============================================================================

/**
 * Common timeout values in milliseconds.
 */
export const TIMEOUTS = {
  /** Default API request timeout (10 seconds) */
  DEFAULT_MS: 10_000,

  /** Short timeout for quick operations (5 seconds) */
  SHORT_MS: 5_000,

  /** Long timeout for complex operations (30 seconds) */
  LONG_MS: 30_000,

  /** Extended timeout for heavy processing (60 seconds) */
  EXTENDED_MS: 60_000,

  /** Stripe API timeout (10 seconds) */
  STRIPE_MS: 10_000,

  /** Image processing timeout (30 seconds) */
  IMAGE_PROCESSING_MS: 30_000,
} as const;

/**
 * Common TTL (Time To Live) values in milliseconds.
 */
export const TTL = {
  /** Analytics cache TTL (5 seconds) */
  ANALYTICS_MS: 5_000,

  /** Session cache TTL (5 minutes) */
  SESSION_MS: 5 * 60 * 1000,

  /** Idempotency key TTL (24 hours) */
  IDEMPOTENCY_KEY_MS: 24 * 60 * 60 * 1000,

  /** Rate limit window (1 minute) */
  RATE_LIMIT_WINDOW_MS: 60_000,

  /** Feature flag cache TTL (5 minutes) */
  FEATURE_FLAG_MS: 5 * 60 * 1000,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates cache control headers with a custom max-age.
 *
 * @param maxAgeSeconds - The max-age value in seconds
 * @param options - Additional cache options
 * @returns Cache-Control header object
 */
export function createCacheHeaders(
  maxAgeSeconds: number,
  options?: {
    public?: boolean;
    private?: boolean;
    staleWhileRevalidate?: number;
    immutable?: boolean;
  }
): { 'Cache-Control': string } {
  const directives: string[] = [];

  if (options?.private) {
    directives.push('private');
  } else if (options?.public !== false) {
    directives.push('public');
  }

  directives.push(`max-age=${maxAgeSeconds}`);

  if (options?.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  if (options?.immutable) {
    directives.push('immutable');
  }

  return { 'Cache-Control': directives.join(', ') };
}

/**
 * Merges multiple header objects into one.
 *
 * @param headers - Header objects to merge
 * @returns Merged headers object
 */
export function mergeHeaders(
  ...headers: Record<string, string>[]
): Record<string, string> {
  return Object.assign({}, ...headers);
}

/**
 * Shared API Constants
 *
 * This module provides common constants used across API routes.
 * Import from here instead of defining inline to ensure consistency.
 */

/**
 * Headers that prevent caching of API responses.
 * Use for dynamic data that should never be cached.
 *
 * @example
 * ```ts
 * import { NO_STORE_HEADERS } from '@/lib/api/constants';
 *
 * return NextResponse.json(data, { headers: NO_STORE_HEADERS });
 * ```
 */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Aggressive cache-busting headers for security-sensitive endpoints.
 * Use for endpoints where caching could cause security issues
 * (e.g., handle availability checks, authentication flows).
 *
 * @example
 * ```ts
 * import { NO_CACHE_HEADERS } from '@/lib/api/constants';
 *
 * return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
 * ```
 */
export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Common HTTP status codes used in API responses.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Standard error codes for API responses.
 * Use these for machine-readable error identification.
 */
export const ERROR_CODES = {
  // Auth errors
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  SESSION_EXPIRED: 'session_expired',

  // Validation errors
  INVALID_REQUEST: 'invalid_request',
  VALIDATION_FAILED: 'validation_failed',
  MISSING_REQUIRED_FIELD: 'missing_required_field',

  // Rate limiting
  RATE_LIMITED: 'rate_limited',

  // Resource errors
  NOT_FOUND: 'not_found',
  ALREADY_EXISTS: 'already_exists',
  CONFLICT: 'conflict',

  // Server errors
  INTERNAL_ERROR: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  DATABASE_ERROR: 'database_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

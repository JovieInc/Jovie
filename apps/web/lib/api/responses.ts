/**
 * API Response Utilities
 *
 * Type-safe response builders for consistent API responses.
 * Use these instead of raw NextResponse.json() calls.
 */

import { NextResponse } from 'next/server';
import {
  ERROR_CODES,
  HTTP_STATUS,
  NO_CACHE_HEADERS,
  NO_STORE_HEADERS,
  type ErrorCode,
} from './constants';

/**
 * Standard API response shape.
 * All API routes should return this structure for consistency.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ErrorCode;
}

/**
 * Options for response builders.
 */
export interface ResponseOptions {
  /** Additional headers to include */
  headers?: Record<string, string>;
  /** Use aggressive no-cache headers (for security-sensitive endpoints) */
  noCache?: boolean;
  /** Allow caching (skips no-store header) */
  allowCache?: boolean;
}

/**
 * Create a successful response.
 *
 * @example
 * ```ts
 * import { successResponse } from '@/lib/api/responses';
 *
 * // Simple success
 * return successResponse({ user: { id: '123', name: 'John' } });
 *
 * // With status code
 * return successResponse({ id: 'new-id' }, { status: 201 });
 * ```
 */
export function successResponse<T>(
  data: T,
  options?: ResponseOptions & { status?: number }
): NextResponse<ApiResponse<T>> {
  const { status = HTTP_STATUS.OK, headers = {}, noCache, allowCache } = options ?? {};

  const responseHeaders = {
    ...(allowCache ? {} : noCache ? NO_CACHE_HEADERS : NO_STORE_HEADERS),
    ...headers,
  };

  return NextResponse.json(
    { success: true, data },
    { status, headers: responseHeaders }
  );
}

/**
 * Create an error response.
 *
 * @example
 * ```ts
 * import { errorResponse, ERROR_CODES } from '@/lib/api/responses';
 *
 * // Simple error
 * return errorResponse('Something went wrong');
 *
 * // With code and status
 * return errorResponse('User not found', {
 *   code: ERROR_CODES.NOT_FOUND,
 *   status: 404
 * });
 * ```
 */
export function errorResponse(
  message: string,
  options?: ResponseOptions & { code?: ErrorCode; status?: number }
): NextResponse<ApiResponse<never>> {
  const { code, status = HTTP_STATUS.BAD_REQUEST, headers = {}, noCache, allowCache } = options ?? {};

  const responseHeaders = {
    ...(allowCache ? {} : noCache ? NO_CACHE_HEADERS : NO_STORE_HEADERS),
    ...headers,
  };

  return NextResponse.json(
    { success: false, error: message, ...(code && { code }) },
    { status, headers: responseHeaders }
  );
}

/**
 * Create an unauthorized response.
 *
 * @example
 * ```ts
 * import { unauthorizedResponse } from '@/lib/api/responses';
 *
 * if (!userId) {
 *   return unauthorizedResponse();
 * }
 * ```
 */
export function unauthorizedResponse(
  message = 'Unauthorized',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.UNAUTHORIZED,
    status: HTTP_STATUS.UNAUTHORIZED,
    noCache: true,
    ...options,
  });
}

/**
 * Create a forbidden response.
 *
 * @example
 * ```ts
 * import { forbiddenResponse } from '@/lib/api/responses';
 *
 * if (!hasPermission) {
 *   return forbiddenResponse('Insufficient permissions');
 * }
 * ```
 */
export function forbiddenResponse(
  message = 'Forbidden',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.FORBIDDEN,
    status: HTTP_STATUS.FORBIDDEN,
    ...options,
  });
}

/**
 * Create a not found response.
 *
 * @example
 * ```ts
 * import { notFoundResponse } from '@/lib/api/responses';
 *
 * if (!resource) {
 *   return notFoundResponse('Resource not found');
 * }
 * ```
 */
export function notFoundResponse(
  message = 'Not found',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.NOT_FOUND,
    status: HTTP_STATUS.NOT_FOUND,
    ...options,
  });
}

/**
 * Create a rate limited response.
 *
 * @example
 * ```ts
 * import { rateLimitedResponse } from '@/lib/api/responses';
 *
 * if (isRateLimited) {
 *   return rateLimitedResponse('Too many requests. Please wait.');
 * }
 * ```
 */
export function rateLimitedResponse(
  message = 'Too many requests',
  options?: ResponseOptions & { retryAfter?: number }
): NextResponse<ApiResponse<never>> {
  const { retryAfter, headers = {}, ...rest } = options ?? {};
  const responseHeaders = retryAfter
    ? { ...headers, 'Retry-After': String(retryAfter) }
    : headers;

  return errorResponse(message, {
    code: ERROR_CODES.RATE_LIMITED,
    status: HTTP_STATUS.RATE_LIMITED,
    headers: responseHeaders,
    ...rest,
  });
}

/**
 * Create a validation error response.
 *
 * @example
 * ```ts
 * import { validationErrorResponse } from '@/lib/api/responses';
 *
 * if (!isValid) {
 *   return validationErrorResponse('Invalid email format');
 * }
 * ```
 */
export function validationErrorResponse(
  message: string,
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.VALIDATION_FAILED,
    status: HTTP_STATUS.BAD_REQUEST,
    ...options,
  });
}

/**
 * Create an internal server error response.
 *
 * @example
 * ```ts
 * import { internalErrorResponse } from '@/lib/api/responses';
 *
 * try {
 *   // ...
 * } catch (error) {
 *   captureError('Operation failed', error);
 *   return internalErrorResponse();
 * }
 * ```
 */
export function internalErrorResponse(
  message = 'Internal server error',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.INTERNAL_ERROR,
    status: HTTP_STATUS.INTERNAL_ERROR,
    ...options,
  });
}

/**
 * Create a database error response.
 *
 * @example
 * ```ts
 * import { databaseErrorResponse } from '@/lib/api/responses';
 *
 * if (dbError) {
 *   return databaseErrorResponse();
 * }
 * ```
 */
export function databaseErrorResponse(
  message = 'Database error',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.DATABASE_ERROR,
    status: HTTP_STATUS.INTERNAL_ERROR,
    ...options,
  });
}

/**
 * Create a conflict response.
 *
 * @example
 * ```ts
 * import { conflictResponse } from '@/lib/api/responses';
 *
 * if (alreadyExists) {
 *   return conflictResponse('Resource already exists');
 * }
 * ```
 */
export function conflictResponse(
  message = 'Conflict',
  options?: ResponseOptions
): NextResponse<ApiResponse<never>> {
  return errorResponse(message, {
    code: ERROR_CODES.CONFLICT,
    status: HTTP_STATUS.CONFLICT,
    ...options,
  });
}

// Re-export constants for convenience
export { ERROR_CODES, HTTP_STATUS } from './constants';

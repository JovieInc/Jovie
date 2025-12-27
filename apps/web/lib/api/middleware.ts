/**
 * API Middleware Utilities
 *
 * Higher-order functions that wrap API route handlers with common functionality.
 * Use these to reduce boilerplate and ensure consistent behavior.
 */

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  internalErrorResponse,
  rateLimitedResponse,
  unauthorizedResponse,
} from './responses';

/**
 * Route handler function type.
 */
export type RouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<Response>;

/**
 * Authenticated route handler function type.
 * Receives the authenticated user ID as an additional parameter.
 */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: { params?: Record<string, string>; userId: string }
) => Promise<Response>;

/**
 * Wrap a route handler with Clerk authentication.
 * Returns 401 if user is not authenticated.
 *
 * @example
 * ```ts
 * import { withAuth } from '@/lib/api/middleware';
 *
 * export const GET = withAuth(async (request, { userId }) => {
 *   // userId is guaranteed to be present
 *   const data = await getUserData(userId);
 *   return successResponse(data);
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler): RouteHandler {
  return async (request, context) => {
    const { userId } = await auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    return handler(request, { ...context, userId });
  };
}

/**
 * Cron secret for verifying scheduled job requests.
 */
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Wrap a route handler with cron job authentication.
 * Verifies Bearer token matches CRON_SECRET in production.
 * Skips verification in development for easier testing.
 *
 * @example
 * ```ts
 * import { withCronAuth } from '@/lib/api/middleware';
 *
 * export const GET = withCronAuth(async (request) => {
 *   // Perform cron job work
 *   await cleanupOldRecords();
 *   return successResponse({ cleaned: 10 });
 * });
 * ```
 */
export function withCronAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    // Skip auth check in development for easier testing
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers.get('authorization');

      if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return unauthorizedResponse();
      }
    }

    return handler(request, context);
  };
}

/**
 * Options for error handling middleware.
 */
export interface ErrorHandlerOptions {
  /** Route name for error tracking context */
  route?: string;
  /** Additional tags for error tracking */
  tags?: Record<string, string>;
}

/**
 * Wrap a route handler with error handling.
 * Catches errors, logs them, and returns a consistent error response.
 *
 * @example
 * ```ts
 * import { withErrorHandler } from '@/lib/api/middleware';
 *
 * export const GET = withErrorHandler(
 *   async (request) => {
 *     const data = await fetchData();
 *     return successResponse(data);
 *   },
 *   { route: '/api/data' }
 * );
 * ```
 */
export function withErrorHandler(
  handler: RouteHandler,
  options?: ErrorHandlerOptions
): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      await captureError(
        `API error${options?.route ? ` in ${options.route}` : ''}`,
        error,
        { route: options?.route, ...options?.tags }
      );

      // Check for rate limit errors
      if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
        return rateLimitedResponse('Too many requests. Please wait.');
      }

      return internalErrorResponse();
    }
  };
}

/**
 * Compose multiple middleware functions.
 * Applies middleware from right to left (innermost first).
 *
 * @example
 * ```ts
 * import { compose, withAuth, withErrorHandler } from '@/lib/api/middleware';
 *
 * // Apply error handling first (outer), then auth (inner)
 * export const GET = compose(
 *   withErrorHandler,
 *   withAuth
 * )(async (request, { userId }) => {
 *   return successResponse({ userId });
 * });
 * ```
 */
export function compose<T extends RouteHandler>(
  ...middlewares: Array<(handler: RouteHandler) => RouteHandler>
): (handler: T) => RouteHandler {
  return (handler) =>
    middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler as RouteHandler
    );
}

/**
 * Pre-composed middleware for authenticated routes with error handling.
 *
 * @example
 * ```ts
 * import { withAuthAndErrorHandler } from '@/lib/api/middleware';
 *
 * export const GET = withAuthAndErrorHandler(
 *   async (request, { userId }) => {
 *     const data = await getUserData(userId);
 *     return successResponse(data);
 *   },
 *   { route: '/api/user' }
 * );
 * ```
 */
export function withAuthAndErrorHandler(
  handler: AuthenticatedHandler,
  options?: ErrorHandlerOptions
): RouteHandler {
  return withErrorHandler(withAuth(handler), options);
}

/**
 * Pre-composed middleware for cron routes with error handling.
 *
 * @example
 * ```ts
 * import { withCronAuthAndErrorHandler } from '@/lib/api/middleware';
 *
 * export const GET = withCronAuthAndErrorHandler(
 *   async (request) => {
 *     await performCleanup();
 *     return successResponse({ cleaned: 10 });
 *   },
 *   { route: '/api/cron/cleanup' }
 * );
 * ```
 */
export function withCronAuthAndErrorHandler(
  handler: RouteHandler,
  options?: ErrorHandlerOptions
): RouteHandler {
  return withErrorHandler(withCronAuth(handler), options);
}

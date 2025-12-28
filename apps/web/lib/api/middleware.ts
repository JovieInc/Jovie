/**
 * API middleware higher-order function for Next.js route handlers.
 * Provides unified authentication, rate limiting, idempotency, and error handling.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import type { DbType } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { isAppError } from '@/lib/errors';
import { TTL } from '@/lib/http/headers';
import type { RateLimiter } from '@/lib/rate-limit';
import { createRateLimitHeaders } from '@/lib/rate-limit';
import { checkIdempotencyKey, storeIdempotencyKey } from './idempotency';

/**
 * Context provided to API handlers by the middleware.
 */
export interface ApiHandlerContext {
  /** Authenticated Clerk user ID */
  clerkUserId: string;
  /** Original Next.js request object */
  request: NextRequest;
  /** URL route parameters (from dynamic routes) */
  params?: Record<string, string>;
  /** Database transaction (when transaction: true in options) */
  tx?: DbType;
}

/**
 * Configuration options for the API middleware.
 */
export interface ApiHandlerOptions {
  /** Rate limiter instance to apply */
  rateLimiter?: RateLimiter | null;
  /** Idempotency configuration */
  idempotency?: {
    /** Enable idempotency key checking */
    enabled: boolean;
    /** Endpoint identifier for idempotency keys (e.g., "PUT:/api/dashboard/social-links") */
    endpoint: string;
    /** TTL for idempotency keys in milliseconds (default: 24 hours) */
    ttlMs?: number;
  };
  /** Wrap handler in a database transaction */
  transaction?: boolean;
  /** Custom headers to include in all responses */
  headers?: HeadersInit;
}

/**
 * API route handler function signature.
 */
type ApiHandler<T = unknown> = (
  ctx: ApiHandlerContext
) => Promise<NextResponse<T>>;

/**
 * Next.js route handler signature (what's exported from route.ts files).
 */
type NextRouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

/**
 * Higher-order function to wrap API route handlers with standard middleware.
 *
 * Features:
 * - Authentication (via Clerk)
 * - Rate limiting with standard headers
 * - Idempotency key checking and storage
 * - Database transactions (optional)
 * - Standardized error handling
 * - Logging and monitoring
 *
 * @example
 * ```typescript
 * export const GET = withApiHandler(
 *   async ({ clerkUserId, request }) => {
 *     // Your handler logic
 *     return NextResponse.json({ data });
 *   },
 *   { headers: NO_STORE_HEADERS }
 * );
 * ```
 *
 * @example With rate limiting and idempotency
 * ```typescript
 * export const PUT = withApiHandler(
 *   async ({ clerkUserId, request }) => {
 *     // Your handler logic
 *     return NextResponse.json({ ok: true });
 *   },
 *   {
 *     transaction: true,
 *     rateLimiter: dashboardLinksRateLimit,
 *     idempotency: {
 *       enabled: true,
 *       endpoint: 'PUT:/api/dashboard/social-links',
 *     },
 *     headers: NO_STORE_HEADERS,
 *   }
 * );
 * ```
 */
export function withApiHandler<T = unknown>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions = {}
): NextRouteHandler {
  return async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const startTime = Date.now();
    const route = new URL(req.url).pathname;

    try {
      // Await params from Next.js 15 API
      const params = context?.params ? await context.params : undefined;

      // Extract core handler logic
      const executeHandler = async (
        tx: DbType | undefined,
        clerkUserId: string
      ): Promise<NextResponse> => {
        // Apply rate limiting if configured
        if (options.rateLimiter) {
          const result = await options.rateLimiter.limit(clerkUserId);
          const rateLimitHeaders = createRateLimitHeaders({
            success: result.success,
            limit: result.limit,
            remaining: result.remaining,
            reset: new Date(result.reset),
          });

          if (!result.success) {
            return NextResponse.json(
              { error: 'Rate limit exceeded. Please try again later.' },
              {
                status: 429,
                headers: {
                  ...options.headers,
                  ...rateLimitHeaders,
                },
              }
            );
          }
        }

        // Check idempotency key if configured
        if (options.idempotency?.enabled) {
          const idempotencyKey = req.headers.get('idempotency-key');
          if (idempotencyKey) {
            const cached = await checkIdempotencyKey(
              idempotencyKey,
              clerkUserId,
              options.idempotency.endpoint
            );
            if (cached.cached && cached.response) {
              return cached.response;
            }
          }
        }

        // Build context for handler
        const ctx: ApiHandlerContext = {
          clerkUserId,
          request: req,
          params,
          tx,
        };

        // Execute handler
        const response = await handler(ctx);

        // Store idempotency key on success (2xx status codes)
        if (
          options.idempotency?.enabled &&
          response.status >= 200 &&
          response.status < 300
        ) {
          const idempotencyKey = req.headers.get('idempotency-key');
          if (idempotencyKey) {
            const clonedResponse = response.clone();
            const responseBody = (await clonedResponse.json()) as Record<
              string,
              unknown
            >;
            await storeIdempotencyKey(
              idempotencyKey,
              clerkUserId,
              options.idempotency.endpoint,
              response.status,
              responseBody,
              options.idempotency.ttlMs ?? TTL.IDEMPOTENCY_KEY_MS
            );
          }
        }

        return response;
      };

      // Use explicit branching based on transaction requirement
      if (options.transaction) {
        return await withDbSessionTx(async (tx, clerkUserId) => {
          return executeHandler(tx, clerkUserId);
        });
      }
      return await withDbSession(async clerkUserId => {
        return executeHandler(undefined, clerkUserId);
      });
    } catch (error) {
      // Calculate request duration for monitoring
      const duration = Date.now() - startTime;

      // Log error for debugging
      console.error(`[${route}] Handler error`, {
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Capture error in monitoring system
      await captureError(`API error: ${route}`, error, {
        route,
        duration,
        method: req.method,
      });

      // Map errors to HTTP responses
      if (isAppError(error)) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            ...error.metadata,
          },
          {
            status: error.statusCode,
            headers: options.headers,
          }
        );
      }

      // Handle auth errors from withDbSession
      if (error instanceof Error && error.message === 'Unauthorized') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          {
            status: 401,
            headers: options.headers,
          }
        );
      }

      // Generic internal server error
      return NextResponse.json(
        { error: 'Internal server error' },
        {
          status: 500,
          headers: options.headers,
        }
      );
    }
  };
}

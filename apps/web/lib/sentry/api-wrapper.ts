/**
 * Sentry API Route Wrapper
 *
 * Provides automatic error tracking and performance monitoring for API routes.
 * Wraps route handlers with Sentry spans and error capturing.
 *
 * Usage:
 *   import { withSentryApiRoute } from '@/lib/sentry/api-wrapper';
 *
 *   export const GET = withSentryApiRoute(
 *     async (request: NextRequest) => {
 *       // Your handler logic
 *       return NextResponse.json({ data });
 *     },
 *     { routeName: '/api/my-route' }
 *   );
 */

import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';

import { REQUEST_ID_HEADER } from '@/lib/monitoring/middleware';

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<Response>;

interface WrapperOptions {
  /** The name of the route for Sentry tracing (e.g., '/api/users/[id]') */
  routeName: string;
  /** Additional tags to attach to the Sentry span */
  tags?: Record<string, string>;
}

/**
 * Extracts request ID from request headers for distributed tracing.
 */
function getRequestId(request: NextRequest): string | null {
  return request.headers.get(REQUEST_ID_HEADER);
}

/**
 * Wraps a Next.js App Router API route handler with Sentry instrumentation.
 * Automatically captures errors and creates spans for performance monitoring.
 *
 * @param handler - The route handler function
 * @param options - Configuration options for the wrapper
 * @returns A wrapped handler with Sentry instrumentation
 */
export function withSentryApiRoute(
  handler: RouteHandler,
  options: WrapperOptions
): RouteHandler {
  return async (request, context) => {
    const method = request.method;
    const spanName = `${method} ${options.routeName}`;
    const requestId = getRequestId(request);

    return Sentry.startSpan(
      {
        op: 'http.server',
        name: spanName,
        attributes: {
          'http.method': method,
          'http.route': options.routeName,
          ...(requestId ? { 'request.id': requestId } : {}),
          ...options.tags,
        },
      },
      async span => {
        try {
          const response = await handler(request, context);

          // Record the response status
          span.setAttribute('http.status_code', response.status);

          // Mark as error if 5xx response
          if (response.status >= 500) {
            span.setStatus({ code: 2, message: 'Internal Server Error' });
          }

          return response;
        } catch (error) {
          // Capture the exception in Sentry with request ID context
          Sentry.captureException(error, {
            extra: {
              route: options.routeName,
              method,
              url: request.url,
              requestId,
            },
            tags: {
              route: options.routeName,
              method,
              ...(requestId ? { requestId } : {}),
              ...options.tags,
            },
          });

          // Mark span as errored
          span.setStatus({ code: 2, message: 'Internal Server Error' });

          // Re-throw to let Next.js handle the error response
          throw error;
        }
      }
    );
  };
}

/**
 * Captures an API-specific error with route context.
 * Use this for errors that you catch and handle gracefully.
 *
 * @param error - The error to capture
 * @param routeName - The API route name
 * @param context - Additional context to attach (including optional requestId)
 */
export function captureApiError(
  error: unknown,
  routeName: string,
  context?: Record<string, unknown>
): void {
  const requestId = context?.requestId as string | undefined;

  Sentry.captureException(error, {
    extra: {
      route: routeName,
      ...context,
    },
    tags: {
      route: routeName,
      errorType: 'api_error',
      ...(requestId ? { requestId } : {}),
    },
  });
}

/**
 * Creates a Sentry span for tracking a specific operation within an API route.
 * Use this for tracking database queries, external API calls, etc.
 *
 * @param operation - The type of operation (e.g., 'db.query', 'http.client')
 * @param name - A descriptive name for the operation
 * @param fn - The async function to execute within the span
 * @returns The result of the function
 */
export async function withApiSpan<T>(
  operation: string,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan(
    {
      op: operation,
      name,
    },
    async () => {
      return fn();
    }
  );
}

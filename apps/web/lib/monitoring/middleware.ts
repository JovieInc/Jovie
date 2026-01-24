import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Request ID header names used for distributed tracing.
 * X-Request-ID is the standard header for request correlation.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generates a unique request ID for tracing requests across services.
 * Uses crypto.randomUUID() when available, with a fallback for older environments.
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extracts request ID from headers or generates a new one.
 * Preserves existing request IDs for distributed tracing.
 */
export function getOrCreateRequestId(req: NextRequest): string {
  const existingId = req.headers.get(REQUEST_ID_HEADER);
  return existingId || generateRequestId();
}

/**
 * Middleware function to monitor API performance
 * @param req The incoming request
 * @returns The response with performance headers
 */
export function monitorApiPerformance(req: NextRequest) {
  // Only monitor API routes
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const start = Date.now();
  const requestId = getOrCreateRequestId(req);
  const response = NextResponse.next();

  // Add timing and request ID headers to the response
  response.headers.set('Server-Timing', `route;dur=${Date.now() - start}`);
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // In a real implementation, you would also log this data to your analytics service
  // This could be done via a background job, edge function, or direct API call

  return response;
}

/**
 * Enhanced middleware function that combines API performance monitoring with other middleware
 * @param middleware The original middleware function
 * @returns A wrapped middleware function with performance monitoring and request ID propagation
 */
export function withPerformanceMonitoring(
  middleware: (req: NextRequest) => NextResponse | Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const start = Date.now();
    const requestId = getOrCreateRequestId(req);

    // Call the original middleware
    const response = await middleware(req);

    // Add timing and request ID headers to the response
    const duration = Date.now() - start;
    response.headers.set('Server-Timing', `middleware;dur=${duration}`);
    response.headers.set(REQUEST_ID_HEADER, requestId);

    // Log performance data for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      const route = req.nextUrl.pathname;
      const method = req.method;

      // Log API performance metrics as breadcrumbs
      if (process.env.NODE_ENV === 'development') {
        Sentry.addBreadcrumb({
          category: 'api-middleware',
          message: `${method} ${route} - ${duration}ms`,
          level: 'info',
          data: { route, method, duration, requestId },
        });
      }
    }

    return response;
  };
}

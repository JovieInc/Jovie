import { NextRequest, NextResponse } from 'next/server';

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
  const response = NextResponse.next();

  // Add timing headers to the response
  response.headers.set('Server-Timing', `route;dur=${Date.now() - start}`);

  // In a real implementation, you would also log this data to your analytics service
  // This could be done via a background job, edge function, or direct API call

  return response;
}

/**
 * Enhanced middleware function that combines API performance monitoring with other middleware
 * @param middleware The original middleware function
 * @returns A wrapped middleware function with performance monitoring
 */
export function withPerformanceMonitoring(
  middleware: (req: NextRequest) => NextResponse | Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const start = Date.now();

    // Call the original middleware
    const response = await middleware(req);

    // Add timing headers to the response
    const duration = Date.now() - start;
    response.headers.set('Server-Timing', `middleware;dur=${duration}`);

    // Log performance data for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      const route = req.nextUrl.pathname;
      const method = req.method;

      // In a real implementation, you would send metric data to your analytics service
      // For now, we'll just log it in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API Middleware] ${method} ${route} - ${duration}ms`);
        // Log additional context in development
        console.log('Context:', {
          userAgent: req.headers.get('user-agent'),
          country: req.headers.get('x-vercel-ip-country'),
          region: req.headers.get('x-vercel-ip-region'),
          city: req.headers.get('x-vercel-ip-city'),
        });
      }
    }

    return response;
  };
}

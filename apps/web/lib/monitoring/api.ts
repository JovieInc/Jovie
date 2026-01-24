import * as Sentry from '@sentry/nextjs';
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

/**
 * Higher-order function to wrap API handlers with performance monitoring
 * @param handler The original API handler
 * @returns A wrapped handler with performance monitoring
 */
export function withPerformanceMonitoring(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const start = Date.now();
    const route = req.url || 'unknown';
    const method = req.method || 'unknown';

    // Add response listener to capture when the response finishes
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;

      // Prepare metric data
      const metricData = {
        route,
        method,
        status,
        duration,
        // Include useful context but avoid sensitive data
        userAgent: req.headers['user-agent'],
        country: req.headers['x-vercel-ip-country'],
        region: req.headers['x-vercel-ip-region'],
        city: req.headers['x-vercel-ip-city'],
      };

      // Log performance data via Sentry breadcrumbs
      Sentry.addBreadcrumb({
        category: 'api',
        message: `${method} ${route} - ${status} - ${duration}ms`,
        level: 'info',
        data: metricData,
      });

      // Send to server-side analytics
      // In a real implementation, you would send this to your analytics service
      // This could be done via a background job, edge function, or direct API call
      sendApiMetric(metricData);
    });

    // Call the original handler
    return handler(req, res);
  };
}

/**
 * Send API metric to analytics
 * This is a placeholder for server-side analytics
 */
function sendApiMetric(data: Record<string, unknown>) {
  // Send API metrics via Sentry custom performance tracking
  Sentry.addBreadcrumb({
    category: 'api-metric',
    message: 'API performance metric',
    level: 'info',
    data,
  });
}

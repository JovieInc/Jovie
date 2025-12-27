import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('API-Monitoring');

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

      // Log performance data
      log.debug(`${method} ${route} - ${status} - ${duration}ms`, metricData);

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
  // In a real implementation, you would send this to your analytics service
  // For example, using a server-side analytics SDK or API

  // Log metric data (scoped logger handles environment gating - dev/preview only)
  log.debug('Metric', data);

  // In production, you might use:
  // - Server-side PostHog
  // - Datadog
  // - New Relic
  // - Custom logging to database
  // - etc.
}

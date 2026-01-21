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

      // Log performance data
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${method} ${route} - ${status} - ${duration}ms`);
      }

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

  // For now, we'll just log it in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[API Metric]', data);
  }

  // In production, you might use:
  // - Datadog
  // - New Relic
  // - Custom logging to database
  // - etc.
}

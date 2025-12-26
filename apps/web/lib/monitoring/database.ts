'use client';

import { track } from '@/lib/analytics';

/**
 * Track database query performance
 * @param operation The name of the database operation being performed
 * @returns A function that wraps the query function and tracks its performance
 */
export function trackDatabaseQuery(operation: string) {
  return async function <T>(queryFn: () => Promise<T>): Promise<T> {
    const start = performance.now();

    try {
      // Execute the query
      const result = await queryFn();
      const duration = performance.now() - start;

      // Send success metric
      sendDatabaseMetric('database_query', {
        operation,
        duration,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;

      // Send error metric
      sendDatabaseMetric('database_query', {
        operation,
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error to maintain normal error flow
      throw error;
    }
  };
}

/**
 * Send database metric to analytics
 */
function sendDatabaseMetric(metricType: string, data: Record<string, unknown>) {
  // Add timestamp for time-series analysis
  const payload = {
    ...data,
    timestamp: Date.now(),
  };

  // Send to analytics
  track(`performance_${metricType}`, payload);
}

/**
 * Detect slow queries based on threshold
 * @param duration Query duration in milliseconds
 * @param threshold Threshold in milliseconds (default: 500ms)
 */
export function isSlowQuery(
  duration: number,
  threshold: number = 500
): boolean {
  return duration > threshold;
}

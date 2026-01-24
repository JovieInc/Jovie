/**
 * Database Logging Utilities
 *
 * Enhanced logging for database operations with structured output.
 * Includes slow query detection and performance monitoring.
 */

import * as Sentry from '@sentry/nextjs';

// Slow query threshold in milliseconds
const SLOW_QUERY_THRESHOLD_MS = 100;
// Very slow query threshold (always log, even in production)
const VERY_SLOW_QUERY_THRESHOLD_MS = 500;

/**
 * Log a database error with context and metadata
 */
export function logDbError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const errorInfo = {
    context,
    timestamp: new Date().toISOString(),
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack:
              process.env.NODE_ENV === 'development' ? error.stack : undefined,
          }
        : error,
    metadata,
    nodeEnv: process.env.NODE_ENV,
  };

  Sentry.captureException(
    error instanceof Error ? error : new Error(String(error)),
    {
      extra: errorInfo,
      tags: { context: 'db_error', dbContext: context },
    }
  );
}

/**
 * Log database info (development only)
 */
export function logDbInfo(
  context: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'development') {
    Sentry.addBreadcrumb({
      category: 'database',
      message: `[${context}] ${message}`,
      level: 'info',
      data: metadata,
    });
  }
}

/**
 * Log a slow query with timing information.
 * Logs queries exceeding SLOW_QUERY_THRESHOLD_MS.
 * Very slow queries (>VERY_SLOW_QUERY_THRESHOLD_MS) are always logged.
 */
export function logSlowQuery(
  query: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVerySlow = durationMs > VERY_SLOW_QUERY_THRESHOLD_MS;
  const isSlow = durationMs > SLOW_QUERY_THRESHOLD_MS;

  // In production, only log very slow queries
  // In development, log all slow queries
  if (!isSlow || (isProduction && !isVerySlow)) {
    return;
  }

  const truncatedQuery =
    query.slice(0, 500) + (query.length > 500 ? '...' : '');

  const logData = {
    type: isVerySlow ? 'VERY_SLOW_QUERY' : 'SLOW_QUERY',
    query: truncatedQuery,
    durationMs,
    threshold: isVerySlow
      ? VERY_SLOW_QUERY_THRESHOLD_MS
      : SLOW_QUERY_THRESHOLD_MS,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  Sentry.addBreadcrumb({
    category: 'database',
    message: `${isVerySlow ? 'Very slow' : 'Slow'} query: ${truncatedQuery.slice(0, 100)}...`,
    level: isVerySlow ? 'warning' : 'info',
    data: logData,
  });
}

/**
 * Wrap a database operation with timing and slow query logging.
 *
 * @param operation - The async database operation to execute
 * @param context - Description of the operation for logging
 * @returns The result of the operation
 */
export async function withQueryTiming<T>(
  operation: () => Promise<T>,
  context: string = 'Query'
): Promise<{ result: T; durationMs: number }> {
  const startTime = performance.now();
  const result = await operation();
  const durationMs = Math.round(performance.now() - startTime);

  // Log if slow
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    logSlowQuery(context, durationMs);
  }

  return { result, durationMs };
}

/**
 * Create a Drizzle query logger with slow query detection.
 * Use this when initializing the Drizzle client.
 */
export function createQueryLogger() {
  return {
    logQuery: (query: string, params: unknown[]): void => {
      // In development, log all queries
      if (process.env.NODE_ENV === 'development') {
        logDbInfo('query', 'Database query executed', {
          query: query.slice(0, 200) + (query.length > 200 ? '...' : ''),
          paramsLength: params.length,
        });
      }
    },
  };
}

/**
 * Get the current slow query thresholds.
 * Useful for monitoring and debugging.
 */
export function getSlowQueryThresholds() {
  return {
    slowQueryMs: SLOW_QUERY_THRESHOLD_MS,
    verySlowQueryMs: VERY_SLOW_QUERY_THRESHOLD_MS,
  };
}

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
 * Track Supabase query performance specifically
 * @param tableName The name of the table being queried
 * @param queryType The type of query (select, insert, update, delete)
 * @returns A function that wraps the Supabase query and tracks its performance
 */
export function trackSupabaseQuery(
  tableName: string,
  queryType: 'select' | 'insert' | 'update' | 'delete'
) {
  return trackDatabaseQuery(`supabase_${tableName}_${queryType}`);
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

/**
 * Create a performance-tracked Supabase client wrapper
 * @param supabaseClient The original Supabase client
 * @returns A wrapped client with performance tracking
 */
export function createTrackedSupabaseClient(supabaseClient: unknown) {
  // This is a simplified example - in a real implementation,
  // you would wrap all methods of the Supabase client

  const client = supabaseClient as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const originalFrom = client.from;

  client.from = (tableName: string) => {
    const tableQuery = originalFrom.call(client, tableName);

    // Wrap select method
    const originalSelect = tableQuery.select;
    tableQuery.select = function (...args: unknown[]) {
      const wrappedQuery = trackSupabaseQuery(tableName, 'select');
      return wrappedQuery(() => originalSelect.apply(this, args));
    };

    // Wrap insert method
    const originalInsert = tableQuery.insert;
    tableQuery.insert = function (...args: unknown[]) {
      const wrappedQuery = trackSupabaseQuery(tableName, 'insert');
      return wrappedQuery(() => originalInsert.apply(this, args));
    };

    // Wrap update method
    const originalUpdate = tableQuery.update;
    tableQuery.update = function (...args: unknown[]) {
      const wrappedQuery = trackSupabaseQuery(tableName, 'update');
      return wrappedQuery(() => originalUpdate.apply(this, args));
    };

    // Wrap delete method
    const originalDelete = tableQuery.delete;
    tableQuery.delete = function (...args: unknown[]) {
      const wrappedQuery = trackSupabaseQuery(tableName, 'delete');
      return wrappedQuery(() => originalDelete.apply(this, args));
    };

    return tableQuery;
  };

  return client;
}

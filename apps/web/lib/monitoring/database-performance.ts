/**
 * Database Performance Monitoring
 * Tracks query performance, connection pool usage, and database health
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { captureError, captureWarning } from '@/lib/error-tracking';

export interface QueryPerformanceMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  rowCount?: number;
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingConnections: number;
  maxConnections: number;
}

export interface DatabaseHealthMetrics {
  isHealthy: boolean;
  responseTime: number;
  activeConnections: number;
  longRunningQueries: number;
  blockedQueries: number;
  cacheHitRatio?: number;
}

class DatabasePerformanceMonitor {
  private queryMetrics: QueryPerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  // Tiered slow-query thresholds
  private static readonly SLOW_QUERY_WARN_MS = 500;
  private static readonly SLOW_QUERY_ERROR_MS = 2000;
  private static readonly SLOW_QUERY_CRITICAL_MS = 5000;

  /**
   * Normalize a query string by replacing literal values with placeholders.
   * Groups queries like "SELECT * FROM users WHERE id = 1" and "... id = 2"
   * under the same fingerprint.
   */
  private fingerprint(query: string): string {
    return query
      .replace(/'[^']*'/g, '?')
      .replace(/\b\d+\b/g, '?')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Track query performance
   */
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    const timestamp = new Date();

    try {
      const result = await queryFn();
      const duration = performance.now() - startTime;

      this.recordMetric({
        query: queryName,
        duration,
        timestamp,
        success: true,
        rowCount: Array.isArray(result) ? result.length : 1,
      });

      // Tiered slow-query alerting
      if (duration > DatabasePerformanceMonitor.SLOW_QUERY_CRITICAL_MS) {
        captureError(
          `Critical slow query: ${queryName} (${duration.toFixed(0)}ms)`,
          new Error('Critical slow query')
        );
      } else if (duration > DatabasePerformanceMonitor.SLOW_QUERY_ERROR_MS) {
        captureError(
          `Slow query: ${queryName} (${duration.toFixed(0)}ms)`,
          new Error('Slow query')
        );
      } else if (duration > DatabasePerformanceMonitor.SLOW_QUERY_WARN_MS) {
        captureWarning(`Slow query detected: ${queryName}`, {
          duration: duration.toFixed(2),
        });
      }

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.recordMetric({
        query: queryName,
        duration,
        timestamp,
        success: false,
        error: errorMessage,
      });

      captureError(`Query failed: ${queryName}`, error);
      throw error;
    }
  }

  /**
   * Record query metrics
   */
  private recordMetric(metric: QueryPerformanceMetrics): void {
    this.queryMetrics.push(metric);

    // Keep only recent metrics
    if (this.queryMetrics.length > this.maxMetricsHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(timeWindowMinutes = 15): {
    totalQueries: number;
    averageResponseTime: number;
    successRate: number;
    slowQueries: QueryPerformanceMetrics[];
    errors: QueryPerformanceMetrics[];
  } {
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const recentMetrics = this.queryMetrics.filter(m => m.timestamp >= cutoff);

    if (recentMetrics.length === 0) {
      return {
        totalQueries: 0,
        averageResponseTime: 0,
        successRate: 1,
        slowQueries: [],
        errors: [],
      };
    }

    const successful = recentMetrics.filter(m => m.success);
    const errors = recentMetrics.filter(m => !m.success);
    const slowQueries = recentMetrics.filter(m => m.duration > 500);

    const averageResponseTime =
      successful.reduce((sum, m) => sum + m.duration, 0) / successful.length;

    return {
      totalQueries: recentMetrics.length,
      averageResponseTime: averageResponseTime || 0,
      successRate: successful.length / recentMetrics.length,
      slowQueries,
      errors,
    };
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth(): Promise<DatabaseHealthMetrics> {
    const startTime = performance.now();

    try {
      // Test basic connectivity with a simple query
      await db.execute(drizzleSql`SELECT 1 as health_check`);
      const responseTime = performance.now() - startTime;

      // Get connection pool stats (if available)
      const connectionStats = await this.getConnectionStats();

      // Check for long-running queries
      const longRunningQueries = await this.getLongRunningQueriesCount();

      // Check for blocked queries
      const blockedQueries = await this.getBlockedQueriesCount();

      const isHealthy =
        responseTime < 1000 && longRunningQueries < 5 && blockedQueries === 0;

      return {
        isHealthy,
        responseTime,
        activeConnections: connectionStats.activeConnections,
        longRunningQueries,
        blockedQueries,
      };
    } catch (error) {
      captureError('Database health check failed', error);
      return {
        isHealthy: false,
        responseTime: performance.now() - startTime,
        activeConnections: 0,
        longRunningQueries: 0,
        blockedQueries: 0,
      };
    }
  }

  /**
   * Get connection pool statistics from pg_stat_activity.
   * Falls back gracefully if Neon restricts access.
   */
  async getConnectionStats(): Promise<ConnectionPoolMetrics> {
    try {
      const result = await db.execute(drizzleSql`
        SELECT
          count(*) FILTER (WHERE state IS NOT NULL) as total,
          count(*) FILTER (WHERE state = 'idle') as idle,
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE wait_event_type IS NOT NULL AND state != 'idle') as waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const row = result.rows[0];
      return {
        totalConnections: Number(row?.total) || 0,
        idleConnections: Number(row?.idle) || 0,
        activeConnections: Number(row?.active) || 0,
        waitingConnections: Number(row?.waiting) || 0,
        maxConnections: 100,
      };
    } catch (error) {
      captureWarning('Cannot read connection pool stats', { error });
      return {
        totalConnections: 0,
        idleConnections: 0,
        activeConnections: 0,
        waitingConnections: 0,
        maxConnections: 0,
      };
    }
  }

  /**
   * Get count of long-running queries
   */
  private async getLongRunningQueriesCount(): Promise<number> {
    try {
      const result = await db.execute(drizzleSql`
        SELECT COUNT(*) as count
        FROM pg_stat_activity
        WHERE state = 'active'
          AND query_start < NOW() - INTERVAL '30 seconds'
          AND query NOT LIKE '%pg_stat_activity%'
      `);

      return Number(result.rows[0]?.count) || 0;
    } catch (error) {
      // Might not have permission to access pg_stat_activity
      captureWarning('Cannot check long-running queries', { error });
      return 0;
    }
  }

  /**
   * Get count of blocked queries
   */
  private async getBlockedQueriesCount(): Promise<number> {
    try {
      const result = await db.execute(drizzleSql`
        SELECT COUNT(*) as count
        FROM pg_stat_activity
        WHERE wait_event_type IS NOT NULL
          AND wait_event_type != 'Client'
      `);

      return Number(result.rows[0]?.count) || 0;
    } catch (error) {
      captureWarning('Cannot check blocked queries', { error });
      return 0;
    }
  }

  /**
   * Get slowest queries in the time window
   */
  getSlowestQueries(limit = 10): QueryPerformanceMetrics[] {
    return this.queryMetrics
      .filter(m => m.success)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get most frequent queries
   */
  getMostFrequentQueries(timeWindowMinutes = 15): Array<{
    query: string;
    count: number;
    averageDuration: number;
  }> {
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const recentMetrics = this.queryMetrics.filter(
      m => m.timestamp >= cutoff && m.success
    );

    const queryGroups = recentMetrics.reduce(
      (groups, metric) => {
        const key = this.fingerprint(metric.query);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(metric);
        return groups;
      },
      {} as Record<string, QueryPerformanceMetrics[]>
    );

    return Object.entries(queryGroups)
      .map(([query, metrics]) => ({
        query,
        count: metrics.length,
        averageDuration:
          metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get latency percentiles for the given time window.
   */
  getLatencyPercentiles(timeWindowMinutes = 15): {
    p50: number;
    p95: number;
    p99: number;
  } {
    const cutoff = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const durations = this.queryMetrics
      .filter(m => m.timestamp >= cutoff && m.success)
      .map(m => m.duration)
      .sort((a, b) => a - b);

    if (durations.length === 0) return { p50: 0, p95: 0, p99: 0 };

    const percentile = (arr: number[], p: number) => {
      const idx = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, idx)];
    };

    return {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
    };
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.queryMetrics = [];
  }
}

// Export singleton instance
export const databaseMonitor = new DatabasePerformanceMonitor();

// Helper function to track queries
export function trackDatabaseQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  return databaseMonitor.trackQuery(queryName, queryFn);
}

// Performance monitoring middleware for API routes
export function withDatabaseMonitoring<T extends unknown[], R>(
  queryName: string,
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    return trackDatabaseQuery(queryName, () => fn(...args));
  };
}

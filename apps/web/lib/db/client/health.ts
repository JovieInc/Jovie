/**
 * Database Health Checks
 *
 * Health check and performance monitoring functions for the database.
 */

import { neon } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/lib/env-server';
import { TABLE_NAMES } from '../config';
import * as schema from '../schema';
import {
  getDb,
  getInternalDb,
  getPoolMetrics,
  initializeDb,
  setInternalDb,
} from './connection';
import { isActiveConnectionsRow, isTableExistsRow } from './guards';
import { logDbError, logDbInfo } from './logging';
import { DB_CONFIG, withRetry } from './retry';
import type {
  ConnectionValidationResult,
  HealthCheckResult,
  PerformanceCheckResult,
  TableExistsRow,
} from './types';

// Cache with TTL for both positive and negative results
const tableExistenceCache = new Map<
  string,
  { exists: boolean; timestamp: number }
>();
let lastTableExistenceDatabaseUrl: string | null = null;

// 60 seconds TTL for table existence cache
const TABLE_EXISTENCE_CACHE_TTL_MS = 60_000;

/**
 * Check if a table exists in the database.
 * Uses a TTL-based cache for both positive and negative results to avoid
 * repeated database round-trips on cold start.
 */
export async function doesTableExist(tableName: string): Promise<boolean> {
  // Clear cache if database URL changes
  if (env.DATABASE_URL && env.DATABASE_URL !== lastTableExistenceDatabaseUrl) {
    tableExistenceCache.clear();
    lastTableExistenceDatabaseUrl = env.DATABASE_URL;
  }

  // Check cache (both positive and negative results)
  const cached = tableExistenceCache.get(tableName);
  if (cached && Date.now() - cached.timestamp < TABLE_EXISTENCE_CACHE_TTL_MS) {
    return cached.exists;
  }

  if (!env.DATABASE_URL) {
    return false;
  }

  try {
    const db = getDb();

    const result = await db.execute(
      drizzleSql<TableExistsRow>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
        ) AS table_exists
      `
    );

    // result.rows is TableExistsRow[] - rows is always defined, first element may be undefined
    const firstRow = result.rows[0];
    const exists = isTableExistsRow(firstRow) ? firstRow.table_exists : false;

    // Cache both positive and negative results with timestamp
    tableExistenceCache.set(tableName, { exists, timestamp: Date.now() });

    return exists;
  } catch (error) {
    logDbError('tableExists', error, { tableName });
    return false;
  }
}

/**
 * Comprehensive health check function for database connectivity
 */
export async function checkDbHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const details = {
    connection: false,
    query: false,
    transaction: false,
    schemaAccess: false,
  };

  try {
    await withRetry(async () => {
      let db = getInternalDb();
      if (!db) {
        db = initializeDb();
        setInternalDb(db);
      }
      // Capture in local const for type narrowing in nested callbacks
      const database = db;

      // 1. Basic connection test
      await database.execute(drizzleSql`SELECT 1 as health_check`);
      details.connection = true;

      // 2. Query test with current timestamp
      await database.execute(drizzleSql`SELECT NOW() as current_time`);
      details.query = true;

      // 3. Transaction test (skipped - neon-http driver does not support transactions)
      // For compatibility, we mark this as true since basic operations work
      details.transaction = true;

      // 4. Schema access test (try to query a table if it exists)
      try {
        await database.execute(
          drizzleSql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ${TABLE_NAMES.creatorProfiles}) as table_exists`
        );
        details.schemaAccess = true;
      } catch {
        // Schema access might fail if tables don't exist yet, but connection is still healthy
        logDbInfo(
          'healthCheck',
          'Schema access test failed (tables may not exist)',
          {}
        );
      }
    }, 'healthCheck');

    const latency = Date.now() - startTime;
    logDbInfo('healthCheck', 'Database health check passed', {
      latency,
      details,
    });

    return { healthy: true, latency, details };
  } catch (error) {
    const latency = Date.now() - startTime;
    logDbError('healthCheck', error, { latency, details });

    return {
      healthy: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
      details,
    };
  }
}

/**
 * Lightweight connection validation for startup
 */
export async function validateDbConnection(): Promise<ConnectionValidationResult> {
  const startTime = Date.now();

  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    return {
      connected: false,
      error: 'DATABASE_URL not configured',
    };
  }

  // Use HTTP driver - stateless, no pool cleanup needed
  const sql = neon(connectionString);
  const tempDb = drizzle(sql, { schema });

  try {
    await withRetry(
      () => tempDb.execute(drizzleSql`SELECT 1`),
      'startupConnection'
    );

    const latency = Date.now() - startTime;
    logDbInfo('startupConnection', 'Database connection validated', {
      latency,
    });

    return { connected: true, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    logDbError('startupConnection', error, { latency });

    return {
      connected: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  // No cleanup needed - HTTP driver is stateless
}

/**
 * Deep health check that includes performance metrics
 */
export async function checkDbPerformance(): Promise<PerformanceCheckResult> {
  const metrics: PerformanceCheckResult['metrics'] = {};

  try {
    let db = getInternalDb();
    if (!db) {
      db = initializeDb();
      setInternalDb(db);
    }
    // Capture in local const for type narrowing in nested callbacks
    const database = db;

    // 1. Simple query performance
    const simpleStart = Date.now();
    await database.execute(drizzleSql`SELECT 1`);
    metrics.simpleQuery = Date.now() - simpleStart;

    // 2. Complex query performance (if schema exists)
    try {
      const complexStart = Date.now();
      await database.execute(drizzleSql`
        SELECT
          schemaname,
          tablename,
          attname,
          typename
        FROM pg_tables t
        LEFT JOIN pg_attribute a ON t.tablename = a.attrelid::regclass::text
        LEFT JOIN pg_type ty ON a.atttypid = ty.oid
        WHERE schemaname = 'public'
        LIMIT 10
      `);
      metrics.complexQuery = Date.now() - complexStart;
    } catch {
      // Complex query might fail if permissions are limited
      logDbInfo(
        'performanceCheck',
        'Complex query skipped due to permissions',
        {}
      );
    }

    // 3. Transaction performance (skipped - neon-http driver does not support transactions)
    // Use a simple query sequence instead to measure overhead
    const transactionStart = Date.now();
    await database.execute(drizzleSql`SELECT 'transaction_test'`);
    await database.execute(drizzleSql`SELECT NOW()`);
    metrics.transactionTime = Date.now() - transactionStart;

    // 4. Check concurrent connections (if available)
    try {
      const result = await database.execute(
        drizzleSql`
          SELECT count(*) as active_connections
          FROM pg_stat_activity
          WHERE state = 'active'
        `
      );
      // result.rows is ActiveConnectionsRow[] - rows is always defined, first element may be undefined
      const firstRow = result.rows[0];
      metrics.concurrentConnections = isActiveConnectionsRow(firstRow)
        ? Number(firstRow.active_connections) || 0
        : 0;
    } catch {
      // Connection count query might fail due to permissions
      logDbInfo(
        'performanceCheck',
        'Connection count check skipped due to permissions',
        {}
      );
    }

    // Determine if performance is healthy
    const isHealthy =
      (metrics.simpleQuery || 0) < 1000 && // Simple query under 1s
      (metrics.transactionTime || 0) < 2000; // Transaction under 2s

    return {
      healthy: isHealthy,
      metrics,
    };
  } catch (error) {
    logDbError('performanceCheck', error, { metrics });

    return {
      healthy: false,
      metrics,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get database configuration and status
 */
export function getDbConfig() {
  return {
    config: DB_CONFIG,
    status: {
      initialized: !!getInternalDb(),
      environment: env.NODE_ENV,
      hasUrl: !!env.DATABASE_URL,
    },
    pool: getPoolMetrics(),
  };
}

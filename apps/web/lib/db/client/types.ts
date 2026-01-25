/**
 * Database Client Types
 *
 * Type definitions for the database client module.
 */

import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type * as schema from '../schema';

export type DbType = NeonDatabase<typeof schema>;

export type TransactionType = Parameters<DbType['transaction']>[0] extends (
  tx: infer T
) => unknown
  ? T
  : never;

/** Row type for table existence check query */
export interface TableExistsRow {
  table_exists: boolean;
}

/** Row type for active connections query */
export interface ActiveConnectionsRow {
  active_connections: string | number;
}

/** Health check result */
export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: {
    connection: boolean;
    query: boolean;
    transaction: boolean;
    schemaAccess: boolean;
  };
}

/** Connection validation result */
export interface ConnectionValidationResult {
  connected: boolean;
  latency?: number;
  error?: string;
}

/** Performance check result */
export interface PerformanceCheckResult {
  healthy: boolean;
  metrics: {
    simpleQuery?: number;
    complexQuery?: number;
    transactionTime?: number;
    concurrentConnections?: number;
  };
  error?: string;
}

/** Pool metrics for monitoring */
export interface PoolMetrics {
  total: number;
  idle: number;
  waiting: number;
  utilization: number;
}

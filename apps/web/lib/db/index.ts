/**
 * Database Module
 *
 * Central export point for database functionality.
 * This module re-exports from the client and schema submodules.
 *
 * @module lib/db
 */

export type { InferModel } from 'drizzle-orm';
// Re-export from drizzle-orm for backwards compatibility
export { and, eq } from 'drizzle-orm';
// Re-export types from client directory
export type {
  ActiveConnectionsRow,
  ConnectionValidationResult,
  DbType,
  HealthCheckResult,
  PerformanceCheckResult,
  TableExistsRow,
  TransactionType,
} from './client/index';

// Re-export client functionality from client directory
export {
  // Health Checks
  checkDbHealth,
  checkDbPerformance,
  // Retry
  DB_CONFIG,
  // Connection
  db,
  doesTableExist,
  getDb,
  getDbConfig,
  initializeDb,
  // Type Guards
  isActiveConnectionsRow,
  isRecord,
  isRetryableError,
  isTableExistsRow,
  // Logging
  logDbError,
  logDbInfo,
  // Session Helpers
  setSessionUser,
  validateDbConnection,
  withDb,
  withRetry,
  withTransaction,
} from './client/index';
// Re-export configuration
export { DB_CONTEXTS, PERFORMANCE_THRESHOLDS, TABLE_NAMES } from './config';

// Re-export schema
export * from './schema';

// Re-export SQL helpers
export * from './sql-helpers';

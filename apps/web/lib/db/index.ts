/**
 * Database Module
 *
 * Main entry point for database operations. Re-exports from the modular
 * client directory for cleaner organization while maintaining backward
 * compatibility with existing imports.
 */

export type { InferModel } from 'drizzle-orm';
// Re-export drizzle-orm utilities for convenience
export { and, eq } from 'drizzle-orm';
// Re-export types from client
export type {
  DbType,
  PoolMetrics,
  TransactionType,
} from './client/index';

// Re-export all client functionality from the modular client directory
export {
  // Health checks
  checkDbHealth,
  checkDbPerformance,
  // Connection
  db,
  doesTableExist,
  getDb,
  getDbConfig,
  getPoolMetrics,
  initializeDb,
  // Retry logic
  isRetryableError,
  // Session helpers
  setSessionUser,
  validateDbConnection,
  withDb,
  withRetry,
  withTransaction,
} from './client/index';
// Re-export table names from config
export { TABLE_NAMES } from './config';

// Re-export schema and SQL helpers
export * from './schema';
export * from './sql-helpers';

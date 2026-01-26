/**
 * Database Client Module
 *
 * Centralized database client with connection management, retry logic,
 * session helpers, and health checks.
 */

// Connection
export {
  db,
  getDb,
  getPoolMetrics,
  getPoolState,
  initializeDb,
} from './connection';
// Type Guards
export { isActiveConnectionsRow, isRecord, isTableExistsRow } from './guards';
// Health Checks
export {
  checkDbHealth,
  checkDbPerformance,
  doesTableExist,
  getDbConfig,
  validateDbConnection,
} from './health';
// Logging
export { logDbError, logDbInfo } from './logging';
// Retry
export { DB_CONFIG, isRetryableError, withRetry } from './retry';

// Session Helpers
export { setSessionUser, withDb, withTransaction } from './session';
// Types
export type {
  ActiveConnectionsRow,
  ConnectionValidationResult,
  DbType,
  HealthCheckResult,
  PerformanceCheckResult,
  PoolMetrics,
  TableExistsRow,
  TransactionType,
} from './types';

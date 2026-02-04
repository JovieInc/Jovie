/**
 * Database Module
 *
 * Main entry point for database operations. Re-exports from the modular
 * client directory for cleaner organization.
 *
 * IMPORTANT: For better build performance, import directly from submodules:
 * - Schema: import { users } from '@/lib/db/schema/auth'
 * - SQL helpers: import { sqlArray } from '@/lib/db/sql-helpers'
 * - Drizzle utilities: import { eq, and } from 'drizzle-orm'
 *
 * VERSION PINNING NOTE:
 * drizzle-orm is pinned to an exact version (0.45.1) in package.json and
 * root pnpm overrides. This is intentional because:
 * 1. drizzle-orm has breaking changes between minor versions
 * 2. Must stay in sync with drizzle-kit for migration compatibility
 * 3. Prevents unexpected schema/query behavior changes
 * Upgrade drizzle-orm only with explicit testing of all migrations and queries.
 */

// Re-export types from client
export type {
  DbOrTransaction,
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

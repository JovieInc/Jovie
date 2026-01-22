import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { env } from '@/lib/env-server';

type WebSocketConstructor = typeof WebSocket;

import {
  registerDevCleanup,
  startDevMemoryMonitor,
} from '@/lib/utils/dev-cleanup';
import { DB_CONTEXTS, PERFORMANCE_THRESHOLDS, TABLE_NAMES } from './config';
import { buildDbHealthChecker } from './health';
import * as schema from './schema';

export { and, eq } from 'drizzle-orm';

declare const EdgeRuntime: string | undefined;

const isEdgeRuntime = typeof EdgeRuntime !== 'undefined';
const isWebSocketAvailable = typeof WebSocket !== 'undefined';

let nodeWebSocketConstructor: WebSocketConstructor | undefined;

/**
 * Determine the WebSocket constructor for the current runtime.
 * Edge runtime doesn't need WebSocket config (Neon handles it).
 * Node runtime prefers built-in WebSocket, falls back to 'ws' package.
 */
function getWebSocketConstructor(): WebSocketConstructor | undefined {
  if (isEdgeRuntime) {
    return undefined;
  }
  if (isWebSocketAvailable) {
    return WebSocket as unknown as WebSocketConstructor;
  }
  // Lazy-load ws package for Node.js environments without native WebSocket
  nodeWebSocketConstructor =
    nodeWebSocketConstructor || (require('ws') as WebSocketConstructor);
  return nodeWebSocketConstructor;
}

const webSocketConstructor = getWebSocketConstructor();

if (webSocketConstructor) {
  neonConfig.webSocketConstructor = webSocketConstructor;
}

// Note: fetchConnectionCache is now always enabled by default in @neondatabase/serverless

// Note: Some production networks block outbound WebSockets; Neon will fall back to HTTPS fetch,
// but ensure firewall rules allow it if WS performance is required.

// HTTPS Fallback Behavior:
// - If WebSocket connection fails, Neon automatically falls back to HTTP fetch
// - Transactions still work but may have slightly higher latency
// - No code changes needed - fallback is automatic
// - Monitor connection logs if experiencing transaction issues

declare global {
  var db: NeonDatabase<typeof schema> | undefined;
  var pool: Pool | undefined;
}

// Create the database client with schema
export type DbType = NeonDatabase<typeof schema>;
export type TransactionType = Parameters<DbType['transaction']>[0] extends (
  tx: infer T
) => unknown
  ? T
  : never;

// Re-export configuration for backward compatibility
const DB_CONFIG = {
  maxRetries: PERFORMANCE_THRESHOLDS.maxRetries,
  retryDelay: PERFORMANCE_THRESHOLDS.retryDelay,
  retryBackoffMultiplier: PERFORMANCE_THRESHOLDS.retryBackoffMultiplier,
} as const;

const positiveTableExistenceCache = new Set<string>();
let lastTableExistenceDatabaseUrl: string | null = null;

// Enhanced logging for database operations
function logDbError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
) {
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

  console.error('[DB_ERROR]', JSON.stringify(errorInfo, null, 2));
}

function logDbInfo(
  context: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'development') {
    const info = {
      context,
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
    console.info('[DB_INFO]', JSON.stringify(info, null, 2));
  }
}

// Retry logic for transient failures
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries = DB_CONFIG.maxRetries
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logDbInfo(
          'retry_success',
          `Operation succeeded on attempt ${attempt}`,
          { context }
        );
      }
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      logDbError('retry_attempt', error, {
        context,
        attempt,
        maxRetries,
        isRetryable,
        willRetry: attempt < maxRetries && isRetryable,
      });

      // Don't retry if not retryable or on last attempt
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff delay
      const delay =
        DB_CONFIG.retryDelay *
        Math.pow(DB_CONFIG.retryBackoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Check if an error is retryable (transient)
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const retryablePatterns = [
    /connection.*reset/i,
    /connection.*terminated/i,
    /connection.*closed/i,
    /server conn crashed\??/i,
    /connection.*unexpectedly/i,
    /timeout/i,
    /network/i,
    /temporary/i,
    /transient/i,
    /econnreset/i,
    /econnrefused/i,
    /etimedout/i,
    /socket hang up/i,
    /database is starting up/i,
    /too many connections/i,
    /connection pool exhausted/i,
    /client has encountered a connection error/i,
    /terminating connection due to administrator command/i,
  ];

  return retryablePatterns.some(
    pattern => pattern.test(error.message) || pattern.test(error.name)
  );
}

// Lazy initialization of database connection
let _db: DbType | undefined;
let _pool: Pool | undefined;
// Flag to prevent concurrent pool initialization (race condition fix)
let _poolInitializing = false;

function initializePoolIfNeeded(
  databaseUrl: string,
  isProduction: boolean
): void {
  if (_pool || _poolInitializing) return;

  // Set flag immediately to prevent concurrent initialization attempts
  _poolInitializing = true;

  try {
    // Double-check after setting flag (another thread may have just finished)
    if (!_pool) {
      _pool = new Pool({
        connectionString: databaseUrl,
        // Neon serverless connections can be terminated unexpectedly;
        // keep pool small and allow quick reconnection
        max: isProduction ? 10 : 3,
        idleTimeoutMillis: 30000, // 30s idle timeout
        connectionTimeoutMillis: 15000, // 15s connection timeout (allows Neon wake-up)
      });

      // Handle pool errors to prevent unhandled rejections
      // and allow the pool to recover from transient failures
      _pool.on('error', (err: Error) => {
        logDbError('pool_error', err, {
          message: 'Pool encountered an error, will attempt to recover',
        });
        // Don't throw - let the pool attempt to recover
      });

      // In development, register pool cleanup so hot reloads and Ctrl+C don't leak pools.
      registerDevCleanup('db_pool', async () => {
        const poolToClose =
          _pool ?? (typeof global !== 'undefined' ? global.pool : undefined);
        if (poolToClose) {
          try {
            await poolToClose.end();
          } catch (error) {
            logDbError('pool_cleanup_failed', error, {
              reason: 'dev_cleanup',
            });
          }
        }

        _pool = undefined;
        _db = undefined;
        _poolInitializing = false;
        if (typeof global !== 'undefined') {
          global.pool = undefined;
          global.db = undefined;
        }
      });

      // Optional dev-only memory monitor (opt-in via env)
      startDevMemoryMonitor();
    }
  } finally {
    _poolInitializing = false;
  }
}

function createDbInstance(pool: Pool, isProduction: boolean): DbType {
  if (isProduction) {
    return drizzle(pool, { schema, logger: false });
  }

  return drizzle(pool, {
    schema,
    logger: {
      logQuery: (query: string, params: unknown[]): void => {
        logDbInfo('query', 'Database query executed', {
          query: query.slice(0, 200) + (query.length > 200 ? '...' : ''),
          paramsLength: params.length,
        });
      },
    },
  });
}

function createTestDbStub(): DbType {
  const fail = () => {
    throw new Error(
      'DATABASE_URL environment variable is not set for tests. ' +
        'Set DATABASE_URL or mock `@/lib/db` in this test.'
    );
  };

  // Minimal surface area so tests can spy/mock these methods without eagerly
  // initializing a real database connection.
  return {
    select: fail as unknown as DbType['select'],
    insert: fail as unknown as DbType['insert'],
    update: fail as unknown as DbType['update'],
    delete: fail as unknown as DbType['delete'],
    execute: fail as unknown as DbType['execute'],
    transaction: fail as unknown as DbType['transaction'],
  } as DbType;
}

function initializeDb(): DbType {
  // Validate the database URL at runtime
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.NODE_ENV === 'test') {
      return createTestDbStub();
    }
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'This is required for database operations but can be omitted during build time.'
    );
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const hasGlobal = typeof global !== 'undefined';

  if (!isProduction && hasGlobal && global.db) {
    _db = global.db;
    if (global.pool) {
      _pool = global.pool;
    }
    return global.db;
  }

  logDbInfo(
    'db_init',
    'Initializing database connection with transaction support',
    {
      environment: process.env.NODE_ENV,
      hasUrl: !!databaseUrl,
      transactionSupport: !isEdgeRuntime, // WebSocket/transactions not available in Edge
      isEdge: isEdgeRuntime,
    }
  );

  // Create the database connection pool with flag guard to prevent race conditions
  // Note: Pool works in both Edge and Node, but WebSocket (for transactions) is Node-only
  initializePoolIfNeeded(databaseUrl, isProduction);

  // Ensure pool was initialized (should always be true at this point)
  if (!_pool) {
    throw new Error('Database pool failed to initialize');
  }

  // Use a single connection in development to avoid connection pool exhaustion
  // In Edge runtime (where global is undefined), always create fresh instance
  if (isProduction || !hasGlobal) {
    return createDbInstance(_pool, isProduction);
  } else {
    if (!global.db) {
      global.pool = _pool;
      global.db = createDbInstance(_pool, isProduction);
    }
    return global.db;
  }
}

// Export a getter function that initializes the connection on first access
export const db = new Proxy({} as DbType, {
  get(target, prop) {
    if (!_db) {
      _db = initializeDb();
    }
    return Reflect.get(_db, prop);
  },
});

export type { InferModel } from 'drizzle-orm';
export { TABLE_NAMES } from './config';
// Re-export schema and types
export * from './schema';

/**
 * Helper to safely execute database operations with error handling and retry logic
 */
export async function withDb<T>(
  operation: (db: DbType) => Promise<T>,
  context = 'withDb'
): Promise<{ data?: T; error?: Error }> {
  try {
    const result = await withRetry(async () => {
      // Ensure db is initialized before passing to operation
      if (!_db) {
        _db = initializeDb();
      }
      return await operation(_db);
    }, context);

    return { data: result };
  } catch (error) {
    logDbError('withDb', error, { context });
    return { error: error as Error };
  }
}

/**
 * Set session user ID for RLS policies with retry logic
 */
export async function setSessionUser(userId: string) {
  try {
    await withRetry(async () => {
      // Ensure db is initialized before using
      if (!_db) {
        _db = initializeDb();
      }
      // Primary session variable for RLS policies
      await _db.execute(drizzleSql`SET LOCAL app.user_id = ${userId}`);
      // Backwards-compatible session variable for legacy policies and tooling
      await _db.execute(drizzleSql`SET LOCAL app.clerk_user_id = ${userId}`);
    }, 'setSessionUser');

    logDbInfo('setSessionUser', 'Session user set successfully', { userId });
  } catch (error) {
    logDbError('setSessionUser', error, { userId });
    throw error;
  }
}

/**
 * Helper to get a database transaction with retry logic
 */
export async function withTransaction<T>(
  operation: (tx: TransactionType) => Promise<T>,
  context = DB_CONTEXTS.transaction
): Promise<{ data?: T; error?: Error }> {
  try {
    const result = await withRetry(async () => {
      // Ensure db is initialized before using
      if (!_db) {
        _db = initializeDb();
      }
      return await _db.transaction(async tx => {
        // The transaction callback receives a properly typed transaction client
        return await operation(tx);
      });
    }, context);

    logDbInfo('withTransaction', 'Transaction completed successfully', {
      context,
    });
    return { data: result };
  } catch (error) {
    logDbError('withTransaction', error, { context });
    return { error: error as Error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTableExistsRow(value: unknown): value is TableExistsRow {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.table_exists === 'boolean';
}

function isActiveConnectionsRow(value: unknown): value is ActiveConnectionsRow {
  if (!isRecord(value)) {
    return false;
  }

  const activeConnections = value.active_connections;
  return (
    typeof activeConnections === 'string' ||
    typeof activeConnections === 'number'
  );
}

/** Row type for table existence check query */
interface TableExistsRow {
  table_exists: boolean;
}

/** Row type for active connections query */
interface ActiveConnectionsRow {
  active_connections: string | number;
}

export async function doesTableExist(tableName: string): Promise<boolean> {
  if (env.DATABASE_URL && env.DATABASE_URL !== lastTableExistenceDatabaseUrl) {
    positiveTableExistenceCache.clear();
    lastTableExistenceDatabaseUrl = env.DATABASE_URL;
  }

  if (positiveTableExistenceCache.has(tableName)) {
    return true;
  }

  if (!env.DATABASE_URL) {
    return false;
  }

  try {
    if (!_db) {
      _db = initializeDb();
    }

    const result = await _db.execute(
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

    if (exists) {
      positiveTableExistenceCache.add(tableName);
    }

    return exists;
  } catch (error) {
    logDbError('tableExists', error, { tableName });
    return false;
  }
}

/**
 * Comprehensive health check function for database connectivity
 */
const getDbForHealthCheck = () => {
  if (!_db) {
    _db = initializeDb();
  }
  return _db;
};

const getPoolState = () =>
  _pool
    ? {
        totalCount: _pool.totalCount,
        idleCount: _pool.idleCount,
        waitingCount: _pool.waitingCount,
      }
    : null;

export const checkDbHealth = buildDbHealthChecker({
  getDb: getDbForHealthCheck,
  getPoolState,
  logDbInfo,
  logDbError,
  tableNames: TABLE_NAMES,
  withRetry,
});

/**
 * Lightweight connection validation for startup
 */
export async function validateDbConnection(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return {
      connected: false,
      error: 'DATABASE_URL not configured',
    };
  }

  const pool = new Pool({ connectionString });
  const tempDb = drizzle(pool, { schema });

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
  } finally {
    try {
      await pool.end();
    } catch {
      // Ignore shutdown errors; connection might already be closed.
    }
  }
}

/**
 * Deep health check that includes performance metrics
 */
export async function checkDbPerformance(): Promise<{
  healthy: boolean;
  metrics: {
    simpleQuery?: number;
    complexQuery?: number;
    transactionTime?: number;
    concurrentConnections?: number;
  };
  error?: string;
}> {
  const metrics: {
    simpleQuery?: number;
    complexQuery?: number;
    transactionTime?: number;
    concurrentConnections?: number;
  } = {};

  try {
    if (!_db) {
      _db = initializeDb();
    }
    // Capture in local const for type narrowing in nested callbacks
    const database = _db;

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

    // 3. Transaction performance
    const transactionStart = Date.now();
    await database.transaction(async tx => {
      await tx.execute(drizzleSql`SELECT 'transaction_test'`);
      await tx.execute(drizzleSql`SELECT NOW()`);
    });
    metrics.transactionTime = Date.now() - transactionStart;

    // 4. Check concurrent connections (if available)
    try {
      const result = await _db!.execute(
        drizzleSql<ActiveConnectionsRow>`
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
      initialized: !!_db,
      environment: process.env.NODE_ENV,
      hasUrl: !!env.DATABASE_URL,
    },
  };
}

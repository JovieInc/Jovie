import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env } from '@/lib/env';
import { DB_CONTEXTS, PERFORMANCE_THRESHOLDS, TABLE_NAMES } from './config';
import * as schema from './schema';

declare const EdgeRuntime: string | undefined;

const isEdgeRuntime = typeof EdgeRuntime !== 'undefined';

// Configure WebSocket for Node runtimes only (fetch caching is now always enabled)
if (!isEdgeRuntime) {
  neonConfig.webSocketConstructor = ws;
}
// Note: Some production networks block outbound WebSockets; Neon will fall back to HTTPS fetch,
// but ensure firewall rules allow it if WS performance is required.

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
  ];

  return retryablePatterns.some(
    pattern => pattern.test(error.message) || pattern.test(error.name)
  );
}

// Lazy initialization of database connection
let _db: DbType | undefined;
let _pool: Pool | undefined;
let cleanupRegistered = false;

function initializeDb(): DbType {
  // Validate the database URL at runtime
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'This is required for database operations but can be omitted during build time.'
    );
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

  // Create the database connection pool
  // Note: Pool works in both Edge and Node, but WebSocket (for transactions) is Node-only
  if (!_pool) {
    _pool = new Pool({ connectionString: databaseUrl });

    // In development, clean up pools created during hot reloads to avoid leaks
    if (
      process.env.NODE_ENV !== 'production' &&
      !cleanupRegistered &&
      typeof process !== 'undefined'
    ) {
      cleanupRegistered = true;
      const cleanup = () => {
        if (_pool) {
          _pool.end().catch(() => {});
          _pool = undefined;
        }
      };

      process.once('beforeExit', cleanup);
      process.once('SIGINT', () => {
        cleanup();
        process.exit(0);
      });
      process.once('SIGTERM', () => {
        cleanup();
        process.exit(0);
      });
    }
  }

  // Use a single connection in development to avoid connection pool exhaustion
  if (process.env.NODE_ENV === 'production') {
    return drizzle(_pool, { schema, logger: false });
  } else {
    if (!global.db) {
      global.pool = _pool;
      global.db = drizzle(_pool, {
        schema,
        logger: {
          logQuery: (query, params) => {
            logDbInfo('query', 'Database query executed', {
              query: query.slice(0, 200) + (query.length > 200 ? '...' : ''),
              paramsLength: params?.length || 0,
            });
          },
        },
      });
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

/**
 * Comprehensive health check function for database connectivity
 */
export async function checkDbHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: {
    connection: boolean;
    query: boolean;
    transaction: boolean;
    schemaAccess: boolean;
  };
}> {
  const startTime = Date.now();
  const details = {
    connection: false,
    query: false,
    transaction: false,
    schemaAccess: false,
  };

  try {
    await withRetry(async () => {
      if (!_db) {
        _db = initializeDb();
      }

      // 1. Basic connection test
      await _db.execute(drizzleSql`SELECT 1 as health_check`);
      details.connection = true;

      // 2. Query test with current timestamp
      await _db.execute(drizzleSql`SELECT NOW() as current_time`);
      details.query = true;

      // 3. Transaction test
      await _db!.transaction(async () => {
        await _db!.execute(drizzleSql`SELECT 'transaction_test' as test`);
      });
      details.transaction = true;

      // 4. Schema access test (try to query a table if it exists)
      try {
        await _db.execute(
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
export async function validateDbConnection(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    if (!env.DATABASE_URL) {
      return {
        connected: false,
        error: 'DATABASE_URL not configured',
      };
    }

    await withRetry(async () => {
      if (!_db) {
        _db = initializeDb();
      }
      // Just test basic connection
      await _db.execute(drizzleSql`SELECT 1`);
    }, 'startupConnection');

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

    // 1. Simple query performance
    const simpleStart = Date.now();
    await _db.execute(drizzleSql`SELECT 1`);
    metrics.simpleQuery = Date.now() - simpleStart;

    // 2. Complex query performance (if schema exists)
    try {
      const complexStart = Date.now();
      await _db.execute(drizzleSql`
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
    await _db!.transaction(async () => {
      await _db!.execute(drizzleSql`SELECT 'transaction_test'`);
      await _db!.execute(drizzleSql`SELECT NOW()`);
    });
    metrics.transactionTime = Date.now() - transactionStart;

    // 4. Check concurrent connections (if available)
    try {
      const result = await _db!.execute(drizzleSql`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);
      // Handle the result - Neon HTTP returns a rows array
      if (Array.isArray(result) && result.length > 0) {
        const firstRow = result[0] as
          | { active_connections: number }
          | undefined;
        metrics.concurrentConnections = firstRow
          ? Number(firstRow.active_connections) || 0
          : 0;
      }
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

/**
 * Database Connection Management
 *
 * Handles database connection initialization, pooling, and lifecycle.
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import * as Sentry from '@sentry/nextjs';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { env } from '@/lib/env-server';
import {
  registerDevCleanup,
  startDevMemoryMonitor,
} from '@/lib/utils/dev-cleanup';
import * as schema from '../schema';
import { logDbError, logDbInfo } from './logging';
import type { DbType, PoolMetrics } from './types';

type WebSocketConstructor = typeof WebSocket;

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
  var db: DbType | undefined;
  var pool: Pool | undefined;
}

// Lazy initialization of database connection
let _db: DbType | undefined;
let _pool: Pool | undefined;
// Flag to prevent concurrent pool initialization (race condition fix)
let _poolInitializing = false;

/**
 * Initialize the pool if needed, with race condition protection
 */
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
        // Performance-optimized pool settings for Neon serverless:
        // - Increased max for higher concurrency under load
        // - Added min to keep connections warm (reduces cold start latency)
        // - Reduced idle timeout since Neon connections are cheap to recreate
        // - Connection timeout of 25s accommodates worst-case Neon cold starts (can exceed 15s)
        max: isProduction ? 15 : 3, // Increased from 10 for higher concurrency
        min: isProduction ? 2 : 1, // Keep minimum connections warm
        idleTimeoutMillis: 20000, // 20s idle timeout (reduced from 30s - Neon connections are cheap)
        connectionTimeoutMillis: 25000, // 25s connection timeout (accommodates worst-case Neon cold start)
        statement_timeout: 15000, // 15s max query execution time
        query_timeout: 15000, // 15s max query time (includes network latency)
        allowExitOnIdle: !isProduction, // Allow clean shutdown in dev
      });

      // Handle pool errors to prevent unhandled rejections
      // and allow the pool to recover from transient failures
      // Log as breadcrumb instead of exception to prevent Sentry feedback loops
      // during transient connection errors (e.g., Neon cold starts)
      _pool.on('error', (err: Error) => {
        logDbError('pool_error', err, {
          message: 'Pool encountered an error, will attempt to recover',
        }, { asBreadcrumb: true });
        // Don't throw - let the pool attempt to recover
      });

      // Monitor pool pressure to detect exhaustion issues
      _pool.on('acquire', () => {
        if (_pool && _pool.waitingCount > 2) {
          Sentry.captureMessage('[db] Pool under pressure', {
            level: 'warning',
            extra: {
              waiting: _pool.waitingCount,
              total: _pool.totalCount,
              idle: _pool.idleCount,
            },
            tags: { context: 'db_pool_pressure' },
          });
        }
      });

      // In development, register pool cleanup so hot reloads and Ctrl+C don't leak pools.
      registerDevCleanup('db_pool', async () => {
        const poolToClose =
          _pool ?? (typeof global !== 'undefined' ? global.pool : undefined);
        if (poolToClose) {
          try {
            await poolToClose.end();
          } catch (error) {
            logDbError('pool_cleanup_failed', error, { reason: 'dev_cleanup' });
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

/**
 * Create a database instance with appropriate logging
 */
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

/**
 * Initialize the database connection
 */
export function initializeDb(): DbType {
  // Validate the database URL at runtime
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'This is required for database operations but can be omitted during build time.'
    );
  }

  const isProduction = env.NODE_ENV === 'production';
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
      environment: env.NODE_ENV,
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

/**
 * Get the current database instance, initializing if needed
 */
export function getDb(): DbType {
  if (!_db) {
    _db = initializeDb();
  }
  return _db;
}

/**
 * Get the internal database reference (for internal use)
 */
export function getInternalDb(): DbType | undefined {
  return _db;
}

/**
 * Set the internal database reference (for internal use)
 */
export function setInternalDb(db: DbType): void {
  _db = db;
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

/**
 * Get connection pool metrics for monitoring.
 * Returns null if pool is not initialized.
 */
export function getPoolMetrics(): PoolMetrics | null {
  if (!_pool) return null;

  const total = _pool.totalCount;
  const idle = _pool.idleCount;
  const waiting = _pool.waitingCount;

  return {
    total,
    idle,
    waiting,
    // Utilization percentage: (active connections / total connections) * 100
    utilization: total > 0 ? Math.round(((total - idle) / total) * 100) : 0,
  };
}

/**
 * Get pool state for health checks (internal use)
 */
export function getPoolState(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} | null {
  return _pool
    ? {
        totalCount: _pool.totalCount,
        idleCount: _pool.idleCount,
        waitingCount: _pool.waitingCount,
      }
    : null;
}

/**
 * Database Connection Management — CANONICAL DB MODULE
 *
 * This is THE single source of truth for database connections in the app.
 * All application code MUST use `import { db } from '@/lib/db'` which
 * re-exports the `db` proxy from this file.
 *
 * Uses Neon WebSocket driver for stateful connection pooling.
 * This is the serverless-native pattern:
 * - Stateful WebSocket connections required for Row Level Security (RLS)
 * - Keep app-level transaction usage isolated via legacy wrappers
 * - Prefer sequential/batch operations for new application code
 *
 * DO NOT create additional database connections elsewhere in the app.
 * Scripts in apps/web/scripts/ are exempt since they run standalone.
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env } from '@/lib/env-server';
import * as schema from '../schema';
import { logDbError, logDbInfo } from './logging';
import type { DbType, PoolMetrics } from './types';

// Configure Neon to use the ws library for WebSocket connections in Node.js
neonConfig.webSocketConstructor = ws;

declare global {
  var db: DbType | undefined;
}

// Lazy initialization of database connection
let _db: DbType | undefined;
let _pool: Pool | undefined;

/**
 * Initialize the database connection using Neon WebSocket driver.
 * Uses a Pool for stateful connections and RLS-compatible session setup.
 */
export function initializeDb(): DbType {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'This is required for database operations but can be omitted during build time.'
    );
  }

  const isProduction = env.NODE_ENV === 'production';
  const hasGlobal = typeof global !== 'undefined';

  // In development, reuse the global instance to avoid connection churn during HMR
  if (!isProduction && hasGlobal && globalThis.db) {
    _db = globalThis.db;
    return globalThis.db;
  }

  logDbInfo(
    'db_init',
    'Initializing database connection with WebSocket driver',
    {
      environment: env.NODE_ENV,
      hasUrl: !!databaseUrl,
      driver: 'neon-serverless',
    }
  );

  // Create Neon WebSocket pool for stateful connections and RLS context
  //
  // Pool settings tuned for Neon serverless to prevent
  // "Connection terminated unexpectedly" errors:
  //   - max: 10 — conservative limit; Neon serverless has its own concurrency
  //     limits and excessive pooled connections get killed server-side
  //   - idleTimeoutMillis: 20s — close idle connections before Neon's server-side
  //     timeout (typically 30-60s) can terminate them unexpectedly
  //   - connectionTimeoutMillis: 15s — allow time for Neon cold starts (up to ~10s)
  //     without waiting forever
  //   - allowExitOnIdle: true — let the Node process exit even if pool connections
  //     remain (important for serverless/edge runtimes)
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  });

  // Handle pool-level errors so unexpected connection terminations
  // are logged and do not crash the process with an unhandled 'error' event.
  pool.on('error', (err: Error) => {
    logDbError(
      'pool_error',
      err,
      { event: 'pool_background_error' },
      { asBreadcrumb: true }
    );
  });

  _pool = pool;

  // Create drizzle instance with WebSocket driver
  const dbInstance = drizzle(pool, {
    schema,
    logger: isProduction
      ? false
      : {
          logQuery: (query: string, params: unknown[]): void => {
            logDbInfo('query', 'Database query executed', {
              query: query.slice(0, 200) + (query.length > 200 ? '...' : ''),
              paramsLength: params.length,
            });
          },
        },
  });

  // Store in global for development HMR reuse
  if (!isProduction && hasGlobal) {
    globalThis.db = dbInstance;
  }

  _db = dbInstance;
  return dbInstance;
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

// Export a lazy-initializing proxy that forwards all access to the real db instance.
// Transactions remain available at the driver level but should stay behind
// audited legacy wrappers rather than app-level call-sites.
export const db = new Proxy({} as DbType, {
  get(_target, prop) {
    if (!_db) {
      _db = initializeDb();
    }

    const value = Reflect.get(_db, prop, _db);
    return typeof value === 'function' ? value.bind(_db) : value;
  },
});

/**
 * Tear down the current pool and force a fresh connection on the next query.
 *
 * This is the nuclear option for recovering from a pool whose connections have
 * all been terminated server-side (e.g. after a Neon branch reset or prolonged
 * outage). Normal transient errors are handled by `withRetry`; call this only
 * when the pool itself is irrecoverably broken.
 */
export async function resetPool(): Promise<void> {
  logDbInfo('pool_reset', 'Resetting database connection pool', {});
  const oldPool = _pool;
  _pool = undefined;
  _db = undefined;
  globalThis.db = undefined;
  if (oldPool) {
    try {
      await oldPool.end();
    } catch (err) {
      logDbError('pool_reset_end', err, {}, { asBreadcrumb: true });
    }
  }
}

/**
 * Get connection pool metrics for monitoring.
 * Returns real metrics from the WebSocket Pool instance.
 */
export function getPoolMetrics(): PoolMetrics | null {
  if (!_pool) {
    return null;
  }

  const total = _pool.totalCount;
  const idle = _pool.idleCount;
  const waiting = _pool.waitingCount;

  return {
    total,
    idle,
    waiting,
    utilization: total > 0 ? (total - idle) / total : 0,
  };
}

/**
 * Get pool state for health checks (internal use).
 * Returns real pool state from the WebSocket Pool instance.
 */
export function getPoolState(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} | null {
  if (!_pool) {
    return null;
  }

  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}

/**
 * Database Connection Management
 *
 * Uses Neon WebSocket driver for stateful connection pooling.
 * This is the serverless-native pattern:
 * - Stateful WebSocket requests required for Row Level Security (RLS)
 * - db.transaction() is supported and maintains connection state
 * - set_config applies properly within the transaction
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env } from '@/lib/env-server';
import * as schema from '../schema';
import { logDbInfo } from './logging';
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
 * Uses a Pool for stateful connections that support transactions and RLS.
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

  // Create Neon WebSocket pool - stateful, supports transactions for RLS
  const pool = new Pool({ connectionString: databaseUrl });
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
// The WebSocket driver supports db.transaction() for RLS session isolation.
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

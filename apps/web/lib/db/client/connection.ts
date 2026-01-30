/**
 * Database Connection Management
 *
 * Uses Neon HTTP driver with managed connection pooling.
 * This is the serverless-native pattern:
 * - Stateless HTTP requests (no WebSocket/TCP pool management)
 * - Neon handles connection pooling server-side via ?pooler=true
 * - One client per request is fine - no local pool needed
 * - Eliminates "pool under pressure" issues in serverless
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/lib/env-server';
import * as schema from '../schema';
import { logDbInfo } from './logging';
import type { DbType, PoolMetrics } from './types';

declare global {
  var db: DbType | undefined;
}

// Lazy initialization of database connection
let _db: DbType | undefined;

/**
 * Initialize the database connection using Neon HTTP driver.
 * Uses the pooled connection URL from Neon console (?pooler=true).
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

  logDbInfo('db_init', 'Initializing database connection with HTTP driver', {
    environment: env.NODE_ENV,
    hasUrl: !!databaseUrl,
    driver: 'neon-http',
  });

  // Create Neon HTTP client - stateless, Neon manages pooling server-side
  const sql = neon(databaseUrl);

  // Create drizzle instance with HTTP driver
  const dbInstance = drizzle(sql, {
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
 * Returns null - HTTP driver doesn't use local pooling.
 * Neon manages pooling server-side with ?pooler=true.
 */
export function getPoolMetrics(): PoolMetrics | null {
  // HTTP driver doesn't have local pool metrics
  // Pooling is managed by Neon server-side
  return null;
}

/**
 * Get pool state for health checks (internal use).
 * Returns null - HTTP driver doesn't use local pooling.
 */
export function getPoolState(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} | null {
  // HTTP driver doesn't have local pool state
  return null;
}

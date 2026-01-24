/**
 * Database Connection Management
 *
 * Handles database connection initialization, pooling, and lifecycle.
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { env } from '@/lib/env-server';
import {
  registerDevCleanup,
  startDevMemoryMonitor,
} from '@/lib/utils/dev-cleanup';
import * as schema from '../schema';
import { logDbError, logDbInfo } from './logging';
import type { DbType } from './types';

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

  // Create the database connection pool
  // Note: Pool works in both Edge and Node, but WebSocket (for transactions) is Node-only
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
          logDbError('pool_cleanup_failed', error, { reason: 'dev_cleanup' });
        }
      }

      _pool = undefined;
      _db = undefined;
      if (typeof global !== 'undefined') {
        global.pool = undefined;
        global.db = undefined;
      }
    });

    // Optional dev-only memory monitor (opt-in via env)
    startDevMemoryMonitor();
  }

  // Use a single connection in development to avoid connection pool exhaustion
  // In Edge runtime (where global is undefined), always create fresh instance
  if (isProduction || !hasGlobal) {
    return drizzle(_pool, { schema, logger: false });
  } else {
    if (!global.db) {
      global.pool = _pool;
      global.db = drizzle(_pool, {
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

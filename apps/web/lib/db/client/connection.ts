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
 * - Keep app-level transaction usage inside audited wrappers
 * - Use runAtomicDbOperation for business invariants spanning statements
 *
 * DO NOT create additional database connections elsewhere in the app.
 * Scripts in apps/web/scripts/ are exempt since they run standalone.
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env, isTestEnv } from '@/lib/env-server';
import { assertGlobalDbAllowed } from '../atomic-context';
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
let _poolConnectionErrors = 0;
let _poolPeak = 0;
let _poolEndpointMode: PoolMetrics['endpointMode'] = 'other';
let _poolMax = 0;

const DEFAULT_POOL_MAX = 20;
const MAX_POOL_MAX = 20;
const TEST_POOL_MAX = 1;

export interface FleetConnectionBudgetInput {
  adminConnections?: number;
  directWorkerConnections?: number;
  effectiveBackendLimit?: number;
  endpointMode: PoolMetrics['endpointMode'];
  interactiveReserve?: number;
  overlappingDeployInstances?: number;
  peakInstances?: number;
  poolMax: number;
  poolerBackendLimit?: number;
  testConnections?: number;
}

export interface FleetConnectionBudget {
  applicationBackendCeiling: number | null;
  applicationClientCeiling: number | null;
  headroom: number | null;
  missing: string[];
  status: 'accepted' | 'rejected' | 'unknown';
  totalBackendCeiling: number | null;
}

/** Fail-closed fleet budget calculation; absent measurements stay unknown. */
export function evaluateFleetConnectionBudget(
  input: FleetConnectionBudgetInput
): FleetConnectionBudget {
  const required = {
    adminConnections: input.adminConnections,
    directWorkerConnections: input.directWorkerConnections,
    effectiveBackendLimit: input.effectiveBackendLimit,
    interactiveReserve: input.interactiveReserve,
    overlappingDeployInstances: input.overlappingDeployInstances,
    peakInstances: input.peakInstances,
    testConnections: input.testConnections,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !Number.isInteger(value) || Number(value) < 0)
    .map(([key]) => key);
  if (input.endpointMode === 'other') missing.push('endpointMode');
  if (
    input.endpointMode === 'transaction-pooled' &&
    (!Number.isInteger(input.poolerBackendLimit) ||
      Number(input.poolerBackendLimit) < 0)
  ) {
    missing.push('poolerBackendLimit');
  }
  if (!Number.isInteger(input.poolMax) || input.poolMax <= 0) {
    missing.push('poolMax');
  }

  if (missing.length > 0) {
    return {
      applicationBackendCeiling: null,
      applicationClientCeiling: null,
      headroom: null,
      missing,
      status: 'unknown',
      totalBackendCeiling: null,
    };
  }

  const applicationClientCeiling =
    input.poolMax * (input.peakInstances! + input.overlappingDeployInstances!);
  const applicationBackendCeiling =
    input.endpointMode === 'transaction-pooled'
      ? input.poolerBackendLimit!
      : applicationClientCeiling;
  const totalBackendCeiling =
    applicationBackendCeiling +
    input.directWorkerConnections! +
    input.testConnections! +
    input.adminConnections!;
  const headroom = input.effectiveBackendLimit! - totalBackendCeiling;

  return {
    applicationBackendCeiling,
    applicationClientCeiling,
    headroom,
    missing,
    status: headroom >= input.interactiveReserve! ? 'accepted' : 'rejected',
    totalBackendCeiling,
  };
}

export function classifyDatabaseEndpoint(
  connectionString: string
): PoolMetrics['endpointMode'] {
  try {
    const hostname = new URL(connectionString).hostname;
    if (/^ep-[a-z0-9-]+-pooler\..*\.neon\.tech$/i.test(hostname)) {
      return 'transaction-pooled';
    }
    if (/^ep-[a-z0-9-]+\..*\.neon\.tech$/i.test(hostname)) return 'direct';
  } catch {
    // Environment validation owns malformed URL errors.
  }
  return 'other';
}

/**
 * Per-process client admission. Production may only lower the audited default;
 * a larger fleet budget needs a new source change and review.
 */
export function resolvePoolMax(): number {
  if (isTestEnv()) return TEST_POOL_MAX;
  const parsed = Number(process.env.DB_POOL_MAX);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_POOL_MAX;
  return Math.min(parsed, MAX_POOL_MAX);
}

/**
 * Opt-in pool-level PostgreSQL statement_timeout (milliseconds).
 * When unset, connections use the server default (no app-enforced cap).
 */
export function resolveStatementTimeoutMs(): number | undefined {
  const raw = process.env.DB_STATEMENT_TIMEOUT_MS;
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function resolvePoolConfig(connectionString: string) {
  const statementTimeoutMs = resolveStatementTimeoutMs();

  return {
    connectionString,
    max: resolvePoolMax(),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
    ...(statementTimeoutMs !== undefined
      ? { statement_timeout: statementTimeoutMs }
      : {}),
  };
}

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
  //   - max: 20 — audited source default. DB_POOL_MAX may lower it after the
  //     fleet budget is measured. This lazy, process-local client ceiling is
  //     not a fleet-wide backend connection count.
  //   - idleTimeoutMillis: 20s — close idle connections before Neon's server-side
  //     timeout (typically 30-60s) can terminate them unexpectedly
  //   - connectionTimeoutMillis: 15s — allow time for Neon cold starts (up to ~10s)
  //     without waiting forever
  //   - allowExitOnIdle: true — let the Node process exit even if pool connections
  //     remain (important for serverless/edge runtimes)
  const poolConfig = resolvePoolConfig(databaseUrl);
  const pool = new Pool(poolConfig);
  _poolConnectionErrors = 0;
  _poolEndpointMode = classifyDatabaseEndpoint(databaseUrl);
  _poolMax = poolConfig.max;
  _poolPeak = 0;

  logDbInfo('pool_config', 'Initialized Neon pool configuration', {
    endpointMode: _poolEndpointMode,
    environment: env.NODE_ENV,
    maxConnections: poolConfig.max,
    statementTimeoutMs: poolConfig.statement_timeout ?? null,
    playwrightWorkerIndex: process.env.TEST_WORKER_INDEX ?? null,
    vitestWorkerId: process.env.VITEST_POOL_ID ?? null,
  });

  // Handle pool-level errors so unexpected connection terminations
  // are logged and do not crash the process with an unhandled 'error' event.
  pool.on('error', (err: Error) => {
    _poolConnectionErrors += 1;
    logDbError(
      'pool_error',
      err,
      { event: 'pool_background_error' },
      { asBreadcrumb: true }
    );
  });
  const recordPoolPeak = () => {
    _poolPeak = Math.max(_poolPeak, pool.totalCount);
  };
  pool.on('connect', recordPoolPeak);
  pool.on('acquire', recordPoolPeak);

  // Guard execution too: a query builder may have been captured before entry.
  pool.query = new Proxy(pool.query, {
    apply(target, receiver, args) {
      assertGlobalDbAllowed();
      return Reflect.apply(target, receiver, args);
    },
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
  assertGlobalDbAllowed();
  if (!_db) {
    _db = initializeDb();
  }
  return db;
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
// audited wrappers rather than app-level call-sites.
export const db = new Proxy({} as DbType, {
  get(_target, prop) {
    assertGlobalDbAllowed();
    if (!_db) {
      _db = initializeDb();
    }

    const value = Reflect.get(_db, prop, _db);
    return typeof value === 'function'
      ? (...args: unknown[]) => {
          assertGlobalDbAllowed();
          return Reflect.apply(value, _db, args);
        }
      : value;
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
    connectionErrors: _poolConnectionErrors,
    endpointMode: _poolEndpointMode,
    total,
    idle,
    max: _poolMax,
    peak: Math.max(_poolPeak, total),
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

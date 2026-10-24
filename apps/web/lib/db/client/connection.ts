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

import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env, isTestEnv } from '@/lib/env-server';
import { assertGlobalDbAllowed } from '../atomic-context';
import * as schema from '../schema';
import { logDbError, logDbInfo } from './logging';
import { preserveTransactionErrors } from './transaction-errors';
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
 * Enforced database deadlines (JOV-3775 slice 2 / JOV-8527).
 *
 * A rejected JavaScript timer never cancels SQL, so every deadline below is
 * applied as a real driver/server setting on the pool itself:
 * - statement_timeout is a PostgreSQL startup parameter on each connection
 *   (real server-side SQL cancellation);
 * - connectionTimeoutMillis bounds both new connections and queued checkout
 *   in the Neon serverless driver;
 * - resetPool() bounds pool teardown so cleanup cannot hang callers.
 *
 * Environment overrides may only move a deadline inside hard bounds; they can
 * never disable or remove one.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 8_000;
const MIN_STATEMENT_TIMEOUT_MS = 1_000;
const MAX_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_ACQUISITION_TIMEOUT_MS = 15_000;
const MIN_ACQUISITION_TIMEOUT_MS = 1_000;
const MAX_ACQUISITION_TIMEOUT_MS = 30_000;
/** Pool teardown budget in resetPool(); not env-tunable. */
const CLEANUP_TIMEOUT_MS = 5_000;

function resolveDeadlineMs(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Pool-level PostgreSQL statement_timeout (milliseconds), always enforced.
 * Defaults to the dashboard query ceiling (8s, under Neon's 20s idle timeout);
 * DB_STATEMENT_TIMEOUT_MS may tune it within [1s, 30s] but never disable it.
 */
export function resolveStatementTimeoutMs(): number {
  return resolveDeadlineMs(
    process.env.DB_STATEMENT_TIMEOUT_MS,
    DEFAULT_STATEMENT_TIMEOUT_MS,
    MIN_STATEMENT_TIMEOUT_MS,
    MAX_STATEMENT_TIMEOUT_MS
  );
}

/**
 * Pool-level acquisition deadline (milliseconds) for pool.connect(), covering
 * both new connections and queued checkout. Defaults to the prior hard-coded
 * 15s; DB_ACQUISITION_TIMEOUT_MS may tune it within [1s, 30s].
 */
export function resolveAcquisitionTimeoutMs(): number {
  return resolveDeadlineMs(
    process.env.DB_ACQUISITION_TIMEOUT_MS,
    DEFAULT_ACQUISITION_TIMEOUT_MS,
    MIN_ACQUISITION_TIMEOUT_MS,
    MAX_ACQUISITION_TIMEOUT_MS
  );
}

export function resolvePoolConfig(connectionString: string) {
  return {
    connectionString,
    max: resolvePoolMax(),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: resolveAcquisitionTimeoutMs(),
    allowExitOnIdle: true,
    statement_timeout: resolveStatementTimeoutMs(),
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
  // "Connection terminated unexpectedly" errors. Deadlines are enforced by
  // resolvePoolConfig (JOV-3775 slice 2 / JOV-8527):
  //   - max: 20 — audited source default. DB_POOL_MAX may lower it after the
  //     fleet budget is measured. This lazy, process-local client ceiling is
  //     not a fleet-wide backend connection count.
  //   - idleTimeoutMillis: 20s — close idle connections before Neon's server-side
  //     timeout (typically 30-60s) can terminate them unexpectedly
  //   - connectionTimeoutMillis: acquisition deadline (default 15s) — allow time
  //     for Neon cold starts (up to ~10s) while bounding queued checkout
  //   - statement_timeout: SQL deadline (default 8s) — server-side cancellation
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
  // The driver removes the pool's idle error listener on checkout. A server
  // disconnect between transaction queries otherwise emits an unhandled error.
  // Keep query rejection/rollback with the driver; observe this event only.
  const onCheckedOutClientError = (err: Error) => {
    _poolConnectionErrors += 1;
    logDbError(
      'client_error',
      err,
      { event: 'pool_checked_out_error' },
      { asBreadcrumb: true }
    );
  };
  pool.on('connect', recordPoolPeak);
  pool.on('acquire', (client: PoolClient) => {
    recordPoolPeak();
    client.on('error', onCheckedOutClientError);
  });
  pool.on('release', (_error: Error | undefined, client: PoolClient) => {
    client.removeListener('error', onCheckedOutClientError);
  });

  // Guard execution too: a query builder may have been captured before entry.
  pool.query = new Proxy(pool.query, {
    apply(target, receiver, args) {
      assertGlobalDbAllowed();
      return Reflect.apply(target, receiver, args);
    },
  });

  _pool = pool;

  // Create drizzle instance with WebSocket driver
  const createDbInstance = (client: Pool | PoolClient) =>
    drizzle(client, {
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
  const dbInstance = createDbInstance(pool);
  // Drizzle's pooled transaction awaits BEGIN before entering its own
  // release finally. Own the checkout here so even a failed BEGIN releases
  // capacity. A client-bound Drizzle session never acquires/releases again.
  dbInstance.transaction = async (callback, config) => {
    const client = await pool.connect();
    let releaseError: Error | undefined;
    const operation: typeof callback = tx =>
      preserveTransactionErrors(tx, callback);
    try {
      return await createDbInstance(client).transaction(operation, config);
    } catch (error) {
      // Discard failed transactions, including uncertain rollback/commit
      // transport failures, rather than returning them to another request.
      releaseError = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      client.release(releaseError);
    }
  };

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
 * Set the internal database reference (for internal use).
 * `undefined` clears an injected client without closing the process pool.
 */
export function setInternalDb(db: DbType | undefined): void {
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
  if (!oldPool) {
    return;
  }

  // Cleanup deadline (JOV-8527): pool.end() waits for checked-out clients,
  // so a wedged client must not hang recovery forever. Both race inputs stay
  // handled — a late end() rejection after the deadline is ignored.
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = await Promise.race([
      oldPool.end().then(() => true),
      new Promise<false>(resolve => {
        cleanupTimer = setTimeout(() => resolve(false), CLEANUP_TIMEOUT_MS);
      }),
    ]);
    if (!completed) {
      logDbError(
        'pool_reset_cleanup_timeout',
        new Error(
          `Pool teardown exceeded ${CLEANUP_TIMEOUT_MS}ms; abandoned the old pool`
        ),
        {},
        { asBreadcrumb: true }
      );
    }
  } catch (err) {
    logDbError('pool_reset_end', err, {}, { asBreadcrumb: true });
  } finally {
    if (cleanupTimer) clearTimeout(cleanupTimer);
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

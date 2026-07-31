/**
 * Database Session Helpers
 *
 * Single source of truth for RLS `set_config('app.clerk_user_id', ...)`.
 * No other app module may embed that SQL directly.
 *
 * Canonical path (preferred): transaction-scoped `is_local=true` via
 * `getRlsTransactionSessionSetSql` / `applyRlsTransactionUser`. Matches the
 * db.md policy of keeping session state inside legacy transaction wrappers.
 *
 * Session-scoped path (quarantined): `is_local=false` with reset-then-set,
 * only for pooled connections outside an explicit transaction (identity-bleed
 * guard). Do not copy this pattern into new call sites.
 *
 * New app code should avoid direct transaction usage; legacy transaction
 * exceptions are centralized in `lib/db/legacy-transaction.ts`.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { captureError } from '@/lib/error-tracking';
import {
  getDb,
  getInternalDb,
  initializeDb,
  setInternalDb,
} from './connection';
import { logDbError, logDbInfo } from './logging';
import { withRetry } from './retry';
import type { DbOrTransaction, DbType } from './types';

/** Sentry fingerprint/tag for RLS set_config failures (JOV-3752). */
export const AUTH_RLS_SET_CONFIG_FAILED = 'auth_rls_set_config_failed' as const;

type ExecuteClient = {
  execute: (query: ReturnType<typeof drizzleSql>) => Promise<unknown>;
};

/**
 * Report a set_config failure under a stable Sentry fingerprint so it never
 * blends into generic "Failed query" / db_error grouping.
 */
function reportRlsSetConfigFailure(
  context: string,
  error: unknown,
  metadata?: { readonly userId?: string }
): void {
  void captureError('RLS set_config failed', error, {
    fingerprint: AUTH_RLS_SET_CONFIG_FAILED,
    error_class: AUTH_RLS_SET_CONFIG_FAILED,
    context,
    ...metadata,
  });
}

/**
 * Transaction-local RLS session set (is_local=true).
 * Preferred for `withDbSessionTx` / ingestion session paths.
 */
export function getRlsTransactionSessionSetSql(userId: string) {
  return drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, true)`;
}

/**
 * SQL that clears the RLS session variable on the current connection.
 * Session-scoped (is_local=false). Required before setting a new identity on
 * pooled connections, which can otherwise inherit a prior request's
 * `app.clerk_user_id`.
 */
export function getRlsSessionResetSql() {
  return drizzleSql`SELECT set_config('app.clerk_user_id', '', false)`;
}

/**
 * SQL that atomically clears then sets the RLS session variable for a user.
 * Session-scoped (is_local=false) so the setting persists for the lifetime of
 * the pooled connection. Identity-bleed guard: always reset before set.
 */
export function getRlsSessionSetSql(userId: string) {
  return drizzleSql`SELECT set_config('app.clerk_user_id', '', false), set_config('app.clerk_user_id', ${userId}, false)`;
}

/**
 * Fallback set without the compound reset — used only after an explicit reset
 * when the primary compound statement fails (JOV-4241: never use `SET ... = $1`).
 */
function getRlsSessionSetFallbackSql(userId: string) {
  return drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, false)`;
}

/**
 * Clear any stale RLS identity left on a pooled connection.
 */
export async function resetRlsSession(db: ExecuteClient): Promise<void> {
  await db.execute(getRlsSessionResetSql());
}

/**
 * Apply transaction-scoped RLS identity (canonical path).
 * Fail closed: rethrows after reporting under AUTH_RLS_SET_CONFIG_FAILED.
 */
export async function applyRlsTransactionUser(
  db: DbOrTransaction | ExecuteClient,
  userId: string,
  context = 'applyRlsTransactionUser_set_config_failed'
): Promise<void> {
  try {
    await db.execute(getRlsTransactionSessionSetSql(userId));
  } catch (error) {
    reportRlsSetConfigFailure(context, error, { userId });
    throw error;
  }
}

/**
 * Reset then set the RLS session user on a pooled connection (session-scoped).
 * Quarantined for non-transaction pooled use only.
 */
export async function applyRlsSessionUser(
  db: ExecuteClient,
  userId: string
): Promise<void> {
  try {
    await db.execute(getRlsSessionSetSql(userId));
  } catch (error) {
    reportRlsSetConfigFailure('applyRlsSessionUser_set_config_failed', error, {
      userId,
    });
    try {
      await resetRlsSession(db);
      // PostgreSQL rejects bind parameters on SET (see setStatementTimeout in
      // lib/db/query-timeout.ts), so the fallback must use parameterized
      // set_config — `SET app.clerk_user_id = $1` is a syntax error (JOV-4241).
      await db.execute(getRlsSessionSetFallbackSql(userId));
    } catch (fallbackError) {
      reportRlsSetConfigFailure(
        'applyRlsSessionUser_set_config_fallback_failed',
        fallbackError,
        { userId }
      );
      throw fallbackError;
    }
  }
}

/**
 * Helper to safely execute database operations with error handling and retry logic
 */
export async function withDb<T>(
  operation: (db: DbType) => Promise<T>,
  context = 'withDb'
): Promise<{ data?: T; error?: Error }> {
  try {
    const result = await withRetry(() => operation(getDb()), context);
    return { data: result };
  } catch (error) {
    logDbError('withDb', error, { context });
    return { error: error as Error };
  }
}

/**
 * Set session user ID for RLS policies with retry logic.
 *
 * Clears any stale identity on the pooled connection before setting the
 * current user's `app.clerk_user_id` via session-scoped set_config.
 */
export async function setSessionUser(userId: string): Promise<void> {
  try {
    await withRetry(async () => {
      let db = getInternalDb();
      if (!db) {
        db = initializeDb();
        setInternalDb(db);
      }

      if (!userId) {
        logDbInfo(
          'setSessionUser',
          'Clearing RLS session — no userId provided'
        );
        await resetRlsSession(db);
        return;
      }

      await applyRlsSessionUser(db, userId);
    }, 'setSessionUser');

    if (userId) {
      logDbInfo('setSessionUser', 'Session user set successfully', { userId });
    }
  } catch (error) {
    logDbError('setSessionUser', error, { userId });
    throw error;
  }
}

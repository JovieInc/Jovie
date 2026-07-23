/**
 * Database Session Helpers
 *
 * Helper functions for database sessions and RLS.
 * New app code should avoid direct transaction usage; legacy transaction
 * exceptions are centralized in `lib/db/legacy-transaction.ts`.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  getInternalDb,
  initializeDb,
  setInternalDb,
} from './connection';
import { logDbError, logDbInfo } from './logging';
import { withRetry } from './retry';
import type { DbType } from './types';

/**
 * SQL that clears the RLS session variable on the current connection.
 * Required before setting a new identity on pooled connections, which can
 * otherwise inherit a prior request's `app.clerk_user_id`.
 */
export function getRlsSessionResetSql() {
  return drizzleSql`SELECT set_config('app.clerk_user_id', '', false)`;
}

/**
 * SQL that atomically clears then sets the RLS session variable for a user.
 * Uses is_local=false (session-scoped) so the setting persists for the
 * lifetime of the pooled connection.
 */
export function getRlsSessionSetSql(userId: string) {
  return drizzleSql`SELECT set_config('app.clerk_user_id', '', false), set_config('app.clerk_user_id', ${userId}, false)`;
}

/**
 * Clear any stale RLS identity left on a pooled connection.
 */
export async function resetRlsSession(db: DbType): Promise<void> {
  await db.execute(getRlsSessionResetSql());
}

/**
 * Reset then set the RLS session user on the provided connection.
 */
export async function applyRlsSessionUser(
  db: DbType,
  userId: string
): Promise<void> {
  try {
    await db.execute(getRlsSessionSetSql(userId));
  } catch (error) {
    logDbError('applyRlsSessionUser_set_config_failed', error, { userId });
    await resetRlsSession(db);
    // PostgreSQL rejects bind parameters on SET (see setStatementTimeout in
    // lib/db/query-timeout.ts), so the fallback must use parameterized
    // set_config — `SET app.clerk_user_id = $1` is a syntax error (JOV-4241).
    await db.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, false)`
    );
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

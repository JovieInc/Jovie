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
 * Uses set_config with is_local=false (session-scoped) so the setting
 * persists for the lifetime of the connection.
 */
export async function setSessionUser(userId: string): Promise<void> {
  if (!userId) {
    logDbInfo('setSessionUser', 'Skipping RLS setup — no userId provided');
    return;
  }

  try {
    await withRetry(async () => {
      let db = getInternalDb();
      if (!db) {
        db = initializeDb();
        setInternalDb(db);
      }
      // Set the RLS session variable in a single round-trip.
      // is_local=false so the setting takes effect for the current connection
      // rather than requiring a transaction block that doesn't exist.
      try {
        await db.execute(
          drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, false)`
        );
      } catch (error) {
        logDbError('setSessionUser_set_config_failed', error, { userId });
        await db.execute(drizzleSql`SET app.clerk_user_id = ${userId}`);
      }
    }, 'setSessionUser');

    logDbInfo('setSessionUser', 'Session user set successfully', { userId });
  } catch (error) {
    logDbError('setSessionUser', error, { userId });
    throw error;
  }
}

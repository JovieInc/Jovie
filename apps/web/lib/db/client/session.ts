/**
 * Database Session Helpers
 *
 * Helper functions for database sessions, transactions, and RLS.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { DB_CONTEXTS } from '../config';
import {
  getDb,
  getInternalDb,
  initializeDb,
  setInternalDb,
} from './connection';
import { logDbError, logDbInfo } from './logging';
import { withRetry } from './retry';
import type { DbType, TransactionType } from './types';

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
 * Uses set_config with is_local=false (session-scoped) instead of SET LOCAL,
 * because SET LOCAL is a no-op outside a transaction block and the Neon HTTP
 * driver does not support transactions. Session-scoped settings persist for
 * the lifetime of the connection (one HTTP request with Neon HTTP).
 */
export async function setSessionUser(userId: string): Promise<void> {
  try {
    await withRetry(async () => {
      let db = getInternalDb();
      if (!db) {
        db = initializeDb();
        setInternalDb(db);
      }
      // Set both RLS session variables in a single round-trip.
      // is_local=false so the setting takes effect for the current connection
      // rather than requiring a transaction block that doesn't exist.
      await db.execute(
        drizzleSql`SELECT set_config('app.user_id', ${userId}, false), set_config('app.clerk_user_id', ${userId}, false)`
      );
    }, 'setSessionUser');

    logDbInfo('setSessionUser', 'Session user set successfully', { userId });
  } catch (error) {
    logDbError('setSessionUser', error, { userId });
    throw error;
  }
}

/**
 * Helper to execute database operations with retry logic.
 * The neon-http driver does not support transactions.
 * This executes the operation directly without transaction guarantees.
 */
export async function withTransaction<T>(
  operation: (tx: TransactionType) => Promise<T>,
  context = DB_CONTEXTS.transaction
): Promise<{ data?: T; error?: Error }> {
  try {
    const result = await withRetry(async () => {
      let db = getInternalDb();
      if (!db) {
        db = initializeDb();
        setInternalDb(db);
      }
      // Execute operation directly without transaction wrapper
      // Pass db as if it were a transaction for API compatibility
      return await operation(db as unknown as TransactionType);
    }, context);

    logDbInfo('withTransaction', 'Operation completed successfully', {
      context,
    });
    return { data: result };
  } catch (error) {
    logDbError('withTransaction', error, { context });
    return { error: error as Error };
  }
}

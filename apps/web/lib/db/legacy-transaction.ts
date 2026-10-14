import 'server-only';

import { db } from '@/lib/db';
import type { DbOrTransaction, DbType } from '@/lib/db/client/types';
import { logDbError } from './client/logging';

type TransactionOptions = Parameters<DbType['transaction']>[1];

/**
 * Legacy-only transaction wrapper.
 *
 * Canonical policy: avoid introducing new app-level `db.transaction()` usage.
 * Keep all unavoidable transaction usage centralized in this module so the
 * remaining exceptions are explicit and easy to audit.
 */
export async function runLegacyDbTransaction<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  let operationError: unknown;
  let operationFailed = false;

  try {
    return await db.transaction(async tx => {
      try {
        return await operation(tx);
      } catch (error) {
        operationError = error;
        operationFailed = true;
        throw error;
      }
    }, options);
  } catch (transactionError) {
    if (!operationFailed || Object.is(transactionError, operationError)) {
      throw transactionError;
    }

    // Drizzle issues ROLLBACK inside its catch block. If that cleanup query
    // also fails, it replaces the operation error with "Failed query:
    // rollback". Keep the cleanup failure as a breadcrumb, but preserve the
    // original exception so callers and Sentry retain the actionable cause.
    logDbError(
      'transaction_rollback_failed',
      transactionError,
      {
        operationErrorMessage:
          operationError instanceof Error
            ? operationError.message
            : String(operationError),
        operationErrorName:
          operationError instanceof Error
            ? operationError.name
            : typeof operationError,
      },
      { asBreadcrumb: true }
    );
    throw operationError;
  }
}

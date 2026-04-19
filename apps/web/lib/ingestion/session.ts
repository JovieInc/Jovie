import 'server-only';

import {
  type IsolationLevel,
  setTransactionSessionUserId,
  validateClerkUserId,
} from '@/lib/auth/session';
import { type DbOrTransaction } from '@/lib/db';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

/**
 * Execute an operation with system ingestion session context.
 * Uses the centralized legacy transaction wrapper to preserve behavior while
 * preventing direct app-level transaction calls from spreading.
 */
export async function withSystemIngestionSession<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: { isolationLevel?: IsolationLevel }
): Promise<T> {
  validateClerkUserId(SYSTEM_INGESTION_USER);

  return runLegacyDbTransaction(
    async tx => {
      // Set the session variable within the transaction.
      // Neon HTTP does not support SET LOCAL fallback outside a real transaction,
      // so fail closed if transaction-scoped session state cannot be set.
      await setTransactionSessionUserId(
        tx,
        SYSTEM_INGESTION_USER,
        'withSystemIngestionSession_set_config_failed'
      );

      return operation(tx);
    },
    options?.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : undefined
  );
}

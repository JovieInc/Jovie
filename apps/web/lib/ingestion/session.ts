import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { type IsolationLevel, validateClerkUserId } from '@/lib/auth/session';
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
      await tx.execute(
        drizzleSql`SELECT set_config('app.clerk_user_id', ${SYSTEM_INGESTION_USER}, true)`
      );

      return operation(tx);
    },
    options?.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : undefined
  );
}

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
      // Set the session variable within the transaction
      try {
        await tx.execute(
          drizzleSql`SELECT set_config('app.clerk_user_id', ${SYSTEM_INGESTION_USER}, true)`
        );
      } catch {
        await tx.execute(
          drizzleSql`SET LOCAL app.clerk_user_id = ${SYSTEM_INGESTION_USER}`
        );
      }

      return operation(tx);
    },
    options?.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : undefined
  );
}

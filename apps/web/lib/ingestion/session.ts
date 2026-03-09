import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { type IsolationLevel, validateClerkUserId } from '@/lib/auth/session';
import { type DbOrTransaction, db } from '@/lib/db';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

/**
 * Execute an operation with system ingestion session context.
 * Uses a transaction to ensure session state is maintained across queries.
 */
export async function withSystemIngestionSession<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: { isolationLevel?: IsolationLevel }
): Promise<T> {
  validateClerkUserId(SYSTEM_INGESTION_USER);

  return db.transaction(
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

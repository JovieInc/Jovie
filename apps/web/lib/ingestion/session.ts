import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { type IsolationLevel, validateClerkUserId } from '@/lib/auth/session';
import { type DbOrTransaction, db } from '@/lib/db';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

export async function withSystemIngestionSession<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: { isolationLevel?: IsolationLevel }
): Promise<T> {
  validateClerkUserId(SYSTEM_INGESTION_USER);
  const isolationLevel = options?.isolationLevel ?? 'read_committed';

  return await db.transaction(async tx => {
    if (isolationLevel !== 'read_committed') {
      const isolationSql =
        isolationLevel === 'serializable'
          ? drizzleSql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
          : drizzleSql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
      await tx.execute(isolationSql);
    }
    // Combined into single query for performance (saves one DB round trip)
    await tx.execute(
      drizzleSql`SELECT set_config('app.user_id', ${SYSTEM_INGESTION_USER}, true), set_config('app.clerk_user_id', ${SYSTEM_INGESTION_USER}, true)`
    );

    return operation(tx);
  });
}

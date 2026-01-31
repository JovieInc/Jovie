import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { type IsolationLevel, validateClerkUserId } from '@/lib/auth/session';
import { type DbOrTransaction, db } from '@/lib/db';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

/**
 * Execute an operation with system ingestion session context.
 * The neon-http driver does not support transactions, so isolationLevel is ignored.
 */
export async function withSystemIngestionSession<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  _options?: { isolationLevel?: IsolationLevel }
): Promise<T> {
  validateClerkUserId(SYSTEM_INGESTION_USER);

  await db.execute(
    drizzleSql`SELECT set_config('app.user_id', ${SYSTEM_INGESTION_USER}, true), set_config('app.clerk_user_id', ${SYSTEM_INGESTION_USER}, true)`
  );

  return operation(db);
}

'server only';

import { sql as drizzleSql } from 'drizzle-orm';
import { validateClerkUserId } from '@/lib/auth/session';
import { type DbType, db } from '@/lib/db';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

export async function withSystemIngestionSession<T>(
  operation: (tx: DbType) => Promise<T>
): Promise<T> {
  validateClerkUserId(SYSTEM_INGESTION_USER);

  return await db.transaction(async tx => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.user_id', ${SYSTEM_INGESTION_USER}, true)`
    );
    await tx.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', ${SYSTEM_INGESTION_USER}, true)`
    );

    return operation(tx);
  });
}

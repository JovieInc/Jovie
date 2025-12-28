'server only';

import { sql as drizzleSql } from 'drizzle-orm';
import { validateClerkUserId } from '@/lib/auth/session';
import { type DbType, db } from '@/lib/db';

/**
 * Get the system ingestion identifier.
 *
 * IMPORTANT: This identifier is used in RLS policies to allow system operations.
 * In production, use SYSTEM_INGESTION_SECRET environment variable with a secure random value.
 * In development, falls back to 'system_ingestion' for ease of testing.
 *
 * To generate a secure secret:
 *   node -e "console.log('sys_ing_' + require('crypto').randomBytes(32).toString('hex'))"
 */
function getSystemIngestionIdentifier(): string {
  const secret = process.env.SYSTEM_INGESTION_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SYSTEM_INGESTION_SECRET environment variable is required in production'
      );
    }
    // Development fallback - warn but allow
    console.warn(
      '[ingestion] SYSTEM_INGESTION_SECRET not set - using default (insecure for production)'
    );
    return 'system_ingestion';
  }

  return secret;
}

// Export for backwards compatibility, but prefer getSystemIngestionIdentifier()
export const SYSTEM_INGESTION_USER = 'system_ingestion';

export async function withSystemIngestionSession<T>(
  operation: (tx: DbType) => Promise<T>
): Promise<T> {
  const ingestionId = getSystemIngestionIdentifier();
  validateClerkUserId(ingestionId);

  return await db.transaction(async tx => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.user_id', ${ingestionId}, true)`
    );
    await tx.execute(
      drizzleSql`SELECT set_config('app.clerk_user_id', ${ingestionId}, true)`
    );

    return operation(tx);
  });
}

import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dashboardIdempotencyKeys } from '@/lib/db/schema/links';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Core logic for cleaning up expired idempotency keys.
 * Exported for use by the consolidated /api/cron/daily-maintenance handler.
 */
export async function cleanupExpiredKeys(): Promise<number> {
  const now = new Date();

  // Use db.execute to get rowCount instead of .returning() which loads all IDs into memory
  const result = await db.execute(
    drizzleSql`DELETE FROM ${dashboardIdempotencyKeys} WHERE ${dashboardIdempotencyKeys.expiresAt} < ${now.toISOString()}::timestamp`
  );

  const deletedCount = result.rowCount ?? 0;

  logger.info(
    `[cleanup-idempotency-keys] Deleted ${deletedCount} expired keys`
  );

  return deletedCount;
}

/**
 * Cron job to clean up expired idempotency keys.
 *
 * Schedule: Daily at 4:00 AM UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const deletedCount = await cleanupExpiredKeys();

    return NextResponse.json(
      {
        success: true,
        message: `Cleaned up ${deletedCount} expired idempotency keys`,
        deleted: deletedCount,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[cleanup-idempotency-keys] Cleanup failed:', error);
    await captureError('Idempotency key cleanup cron failed', error, {
      route: '/api/cron/cleanup-idempotency-keys',
      method: 'GET',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import { lt } from 'drizzle-orm';
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
 * Cron job to clean up expired idempotency keys.
 *
 * Idempotency keys have a 24-hour TTL (set at creation time in expiresAt).
 * This job deletes all keys where expiresAt < now.
 *
 * Schedule: Daily at 4:00 AM UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  // Verify cron secret in all environments
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const now = new Date();

  try {
    // Delete expired idempotency keys
    // The expiresAt index makes this query efficient
    const result = await db
      .delete(dashboardIdempotencyKeys)
      .where(lt(dashboardIdempotencyKeys.expiresAt, now))
      .returning({ id: dashboardIdempotencyKeys.id });

    const deletedCount = result.length;

    logger.info(
      `[cleanup-idempotency-keys] Deleted ${deletedCount} expired keys`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Cleaned up ${deletedCount} expired idempotency keys`,
        deleted: deletedCount,
        timestamp: now.toISOString(),
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

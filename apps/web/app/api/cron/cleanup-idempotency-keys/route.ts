import { lt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { dashboardIdempotencyKeys, db } from '@/lib/db';
import { verifyCronSecret } from '@/lib/security/cron-auth';

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
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison (enforced in all environments)
  if (!verifyCronSecret(request)) {
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

    console.log(
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
    console.error('[cleanup-idempotency-keys] Cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

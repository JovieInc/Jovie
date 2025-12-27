import { lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { dashboardIdempotencyKeys, db } from '@/lib/db';

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
  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
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

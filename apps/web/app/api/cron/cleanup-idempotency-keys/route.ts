import { lt } from 'drizzle-orm';
import { dashboardIdempotencyKeys, db } from '@/lib/db';
import { withCronAuthAndErrorHandler } from '@/lib/api/middleware';
import { successResponse } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Cron job to clean up expired idempotency keys.
 *
 * Idempotency keys have a 24-hour TTL (set at creation time in expiresAt).
 * This job deletes all keys where expiresAt < now.
 *
 * Schedule: Daily at 4:00 AM UTC (configured in vercel.json)
 */
export const GET = withCronAuthAndErrorHandler(
  async () => {
    const now = new Date();

    const result = await db
      .delete(dashboardIdempotencyKeys)
      .where(lt(dashboardIdempotencyKeys.expiresAt, now))
      .returning({ id: dashboardIdempotencyKeys.id });

    const deletedCount = result.length;

    console.log(
      `[cleanup-idempotency-keys] Deleted ${deletedCount} expired keys`
    );

    return successResponse({
      message: `Cleaned up ${deletedCount} expired idempotency keys`,
      deleted: deletedCount,
      timestamp: now.toISOString(),
    });
  },
  { route: '/api/cron/cleanup-idempotency-keys' }
);

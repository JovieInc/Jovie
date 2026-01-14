/**
 * Data Retention Cleanup Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to automatically delete analytics data older than the retention period.
 *
 * Schedule: Daily at 3:00 AM UTC
 * Authorization: Requires CRON_SECRET header
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cleanup

/**
 * Timing-safe comparison of cron secret to prevent timing attacks
 */
function verifyCronSecret(provided: string | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = authHeader?.replace('Bearer ', '');

  if (!process.env.CRON_SECRET) {
    logger.error('[Data Retention Cron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (!verifyCronSecret(cronSecret)) {
    console.warn('[Data Retention Cron] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Data Retention Cron] Starting scheduled cleanup');

    const result = await runDataRetentionCleanup();

    console.log('[Data Retention Cron] Cleanup completed successfully', {
      clickEventsDeleted: result.clickEventsDeleted,
      audienceMembersDeleted: result.audienceMembersDeleted,
      notificationSubscriptionsDeleted: result.notificationSubscriptionsDeleted,
      duration: `${result.duration}ms`,
    });

    return NextResponse.json({
      success: true,
      result: {
        clickEventsDeleted: result.clickEventsDeleted,
        audienceMembersDeleted: result.audienceMembersDeleted,
        notificationSubscriptionsDeleted:
          result.notificationSubscriptionsDeleted,
        retentionDays: result.retentionDays,
        cutoffDate: result.cutoffDate.toISOString(),
        duration: result.duration,
      },
    });
  } catch (error) {
    logger.error('[Data Retention Cron] Cleanup failed', error);
    return NextResponse.json(
      { error: 'Cleanup failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}

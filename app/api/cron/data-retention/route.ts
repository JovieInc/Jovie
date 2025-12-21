/**
 * Data Retention Cleanup Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to automatically delete analytics data older than the retention period.
 *
 * Schedule: Daily at 3:00 AM UTC
 * Authorization: Requires CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cleanup

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET) {
    console.error('[Data Retention Cron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (cronSecret !== CRON_SECRET) {
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
    console.error('[Data Retention Cron] Cleanup failed', error);
    return NextResponse.json(
      { error: 'Cleanup failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}

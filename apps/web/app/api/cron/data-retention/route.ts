/**
 * Data Retention Cleanup Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to automatically delete analytics data older than the retention period.
 *
 * Schedule: Daily at 3:00 AM UTC
 * Authorization: Requires CRON_SECRET header
 */

import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { withCronAuthAndErrorHandler } from '@/lib/api/middleware';
import { successResponse } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const GET = withCronAuthAndErrorHandler(
  async () => {
    console.log('[Data Retention Cron] Starting scheduled cleanup');

    const result = await runDataRetentionCleanup();

    console.log('[Data Retention Cron] Cleanup completed successfully', {
      clickEventsDeleted: result.clickEventsDeleted,
      audienceMembersDeleted: result.audienceMembersDeleted,
      notificationSubscriptionsDeleted: result.notificationSubscriptionsDeleted,
      duration: `${result.duration}ms`,
    });

    return successResponse({
      clickEventsDeleted: result.clickEventsDeleted,
      audienceMembersDeleted: result.audienceMembersDeleted,
      notificationSubscriptionsDeleted: result.notificationSubscriptionsDeleted,
      retentionDays: result.retentionDays,
      cutoffDate: result.cutoffDate.toISOString(),
      duration: result.duration,
    });
  },
  { route: '/api/cron/data-retention' }
);

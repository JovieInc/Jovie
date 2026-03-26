/**
 * Data Retention Cleanup Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to automatically delete analytics data older than the retention period.
 *
 * Schedule: Daily at 2:00 AM UTC
 * Authorization: Requires CRON_SECRET header
 */

import { NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cleanup
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/data-retention',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  try {
    logger.info('[Data Retention Cron] Starting scheduled cleanup');

    const result = await runDataRetentionCleanup();

    const totalDeleted =
      result.clickEventsDeleted +
      result.audienceMembersDeleted +
      result.notificationSubscriptionsDeleted +
      result.pixelEventsDeleted +
      result.stripeWebhookEventsDeleted +
      result.webhookEventsDeleted +
      result.notificationDeliveryLogDeleted +
      result.emailEngagementDeleted +
      result.chatMessagesDeleted +
      result.chatAuditLogDeleted +
      result.billingAuditLogDeleted +
      result.adminAuditLogDeleted +
      result.ingestionJobsDeleted +
      result.unsubscribeTokensDeleted +
      result.emailSendAttributionDeleted +
      result.emailSuppressionsDeleted;

    logger.info('[Data Retention Cron] Cleanup completed successfully', {
      totalDeleted,
      duration: `${result.duration}ms`,
      clickEventsDeleted: result.clickEventsDeleted,
      audienceMembersDeleted: result.audienceMembersDeleted,
      notificationSubscriptionsDeleted: result.notificationSubscriptionsDeleted,
      pixelEventsDeleted: result.pixelEventsDeleted,
      stripeWebhookEventsDeleted: result.stripeWebhookEventsDeleted,
      webhookEventsDeleted: result.webhookEventsDeleted,
      notificationDeliveryLogDeleted: result.notificationDeliveryLogDeleted,
      emailEngagementDeleted: result.emailEngagementDeleted,
      chatMessagesDeleted: result.chatMessagesDeleted,
      chatAuditLogDeleted: result.chatAuditLogDeleted,
      billingAuditLogDeleted: result.billingAuditLogDeleted,
      adminAuditLogDeleted: result.adminAuditLogDeleted,
      ingestionJobsDeleted: result.ingestionJobsDeleted,
      unsubscribeTokensDeleted: result.unsubscribeTokensDeleted,
      emailSendAttributionDeleted: result.emailSendAttributionDeleted,
      emailSuppressionsDeleted: result.emailSuppressionsDeleted,
    });

    return NextResponse.json(
      {
        success: true,
        totalDeleted,
        result: {
          clickEventsDeleted: result.clickEventsDeleted,
          audienceMembersDeleted: result.audienceMembersDeleted,
          notificationSubscriptionsDeleted:
            result.notificationSubscriptionsDeleted,
          pixelEventsDeleted: result.pixelEventsDeleted,
          stripeWebhookEventsDeleted: result.stripeWebhookEventsDeleted,
          webhookEventsDeleted: result.webhookEventsDeleted,
          notificationDeliveryLogDeleted: result.notificationDeliveryLogDeleted,
          emailEngagementDeleted: result.emailEngagementDeleted,
          chatMessagesDeleted: result.chatMessagesDeleted,
          chatAuditLogDeleted: result.chatAuditLogDeleted,
          billingAuditLogDeleted: result.billingAuditLogDeleted,
          adminAuditLogDeleted: result.adminAuditLogDeleted,
          ingestionJobsDeleted: result.ingestionJobsDeleted,
          unsubscribeTokensDeleted: result.unsubscribeTokensDeleted,
          emailSendAttributionDeleted: result.emailSendAttributionDeleted,
          emailSuppressionsDeleted: result.emailSuppressionsDeleted,
          retentionDays: result.retentionDays,
          cutoffDate: result.cutoffDate.toISOString(),
          chatCutoffDate: result.chatCutoffDate.toISOString(),
          duration: result.duration,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    // Log full error details internally
    logger.error('[Data Retention Cron] Cleanup failed', error);
    await captureError('Data retention cleanup cron failed', error, {
      route: '/api/cron/data-retention',
      method: 'GET',
    });
    // Return sanitized error to prevent information disclosure
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

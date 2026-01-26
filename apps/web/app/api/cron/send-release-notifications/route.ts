import { and, eq, lt, lte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  creatorProfiles,
  db,
  discogReleases,
  fanReleaseNotifications,
  notificationSubscriptions,
  providerLinks,
} from '@/lib/db';
import { getReleaseDayNotificationEmail } from '@/lib/email/templates/release-day-notification';
import { env } from '@/lib/env';
import { sendNotification } from '@/lib/notifications/service';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Process up to 100 notifications per run to avoid timeouts
const BATCH_SIZE = 100;

// Timeout for stuck "sending" rows - if a notification has been in "sending" state
// for longer than this, reset it to "pending" for retry
const SENDING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Types
// ============================================================================

interface PendingNotification {
  id: string;
  creatorProfileId: string;
  releaseId: string;
  notificationSubscriptionId: string;
  notificationType: string;
  metadata: unknown;
}

interface ProcessingContext {
  now: Date;
  notification: PendingNotification;
}

type ProcessResult = 'sent' | 'failed' | 'skipped';

// ============================================================================
// Database Operations
// ============================================================================

async function recoverStuckNotifications(
  now: Date,
  timeoutThreshold: Date
): Promise<number> {
  const recoveredRows = await db
    .update(fanReleaseNotifications)
    .set({ status: 'pending', updatedAt: now })
    .where(
      and(
        eq(fanReleaseNotifications.status, 'sending'),
        lt(fanReleaseNotifications.updatedAt, timeoutThreshold)
      )
    )
    .returning({ id: fanReleaseNotifications.id });

  return recoveredRows.length;
}

async function fetchPendingNotifications(
  now: Date
): Promise<PendingNotification[]> {
  return db
    .select({
      id: fanReleaseNotifications.id,
      creatorProfileId: fanReleaseNotifications.creatorProfileId,
      releaseId: fanReleaseNotifications.releaseId,
      notificationSubscriptionId:
        fanReleaseNotifications.notificationSubscriptionId,
      notificationType: fanReleaseNotifications.notificationType,
      metadata: fanReleaseNotifications.metadata,
    })
    .from(fanReleaseNotifications)
    .where(
      and(
        eq(fanReleaseNotifications.status, 'pending'),
        eq(fanReleaseNotifications.notificationType, 'release_day'),
        lte(fanReleaseNotifications.scheduledFor, now)
      )
    )
    .orderBy(
      fanReleaseNotifications.scheduledFor,
      fanReleaseNotifications.createdAt
    )
    .limit(BATCH_SIZE);
}

async function claimNotification(
  notificationId: string,
  now: Date
): Promise<boolean> {
  const claimed = await db
    .update(fanReleaseNotifications)
    .set({ status: 'sending', updatedAt: now })
    .where(
      and(
        eq(fanReleaseNotifications.id, notificationId),
        eq(fanReleaseNotifications.status, 'pending')
      )
    )
    .returning({ id: fanReleaseNotifications.id });

  return claimed.length > 0;
}

async function updateNotificationStatus(
  notificationId: string,
  now: Date,
  status: 'sent' | 'failed' | 'cancelled',
  error?: string | null
): Promise<void> {
  await db
    .update(fanReleaseNotifications)
    .set({
      status,
      sentAt: status === 'sent' ? now : null,
      error: error ?? null,
      updatedAt: now,
    })
    .where(eq(fanReleaseNotifications.id, notificationId));
}

async function fetchReleaseDetails(releaseId: string) {
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      artworkUrl: discogReleases.artworkUrl,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  return release;
}

async function fetchCreatorProfile(creatorProfileId: string) {
  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  return creator;
}

async function fetchActiveSubscriber(subscriptionId: string) {
  const [subscriber] = await db
    .select({
      id: notificationSubscriptions.id,
      channel: notificationSubscriptions.channel,
      email: notificationSubscriptions.email,
      phone: notificationSubscriptions.phone,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.id, subscriptionId),
        sql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        sql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
      )
    )
    .limit(1);

  return subscriber;
}

async function fetchStreamingLinks(releaseId: string) {
  return db
    .select({
      providerId: providerLinks.providerId,
      url: providerLinks.url,
    })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, releaseId)
      )
    );
}

// ============================================================================
// Notification Processing
// ============================================================================

async function sendEmailNotification(
  ctx: ProcessingContext,
  subscriber: { email: string },
  emailData: { subject: string; text: string; html: string }
): Promise<ProcessResult> {
  const result = await sendNotification(
    {
      id: ctx.notification.id,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      channels: ['email'],
      category: 'marketing',
    },
    { email: subscriber.email }
  );

  const success = result.delivered.length > 0;
  const error = success ? null : (result.errors[0]?.error ?? 'Unknown error');

  await updateNotificationStatus(
    ctx.notification.id,
    ctx.now,
    success ? 'sent' : 'failed',
    error
  );

  return success ? 'sent' : 'failed';
}

async function processNotification(
  ctx: ProcessingContext
): Promise<ProcessResult> {
  // Atomically claim the notification
  const claimed = await claimNotification(ctx.notification.id, ctx.now);
  if (!claimed) {
    return 'skipped';
  }

  // Fetch release details
  const release = await fetchReleaseDetails(ctx.notification.releaseId);
  if (!release) {
    throw new Error(`Release not found: ${ctx.notification.releaseId}`);
  }

  // Validate release date hasn't been rescheduled to future
  if (release.releaseDate && release.releaseDate > ctx.now) {
    await updateNotificationStatus(
      ctx.notification.id,
      ctx.now,
      'cancelled',
      'Release date changed to future date'
    );
    logger.info(
      `[send-release-notifications] Cancelled notification ${ctx.notification.id} - release date changed to ${release.releaseDate.toISOString()}`
    );
    return 'skipped';
  }

  // Fetch creator profile
  const creator = await fetchCreatorProfile(ctx.notification.creatorProfileId);
  if (!creator) {
    throw new Error(`Creator not found: ${ctx.notification.creatorProfileId}`);
  }

  // Fetch subscriber (also verifies they haven't unsubscribed)
  const subscriber = await fetchActiveSubscriber(
    ctx.notification.notificationSubscriptionId
  );
  if (!subscriber) {
    await updateNotificationStatus(ctx.notification.id, ctx.now, 'cancelled');
    return 'skipped';
  }

  // Fetch streaming links
  const links = await fetchStreamingLinks(release.id);

  // Build email content
  const artistName = creator.displayName ?? creator.username;
  const emailData = getReleaseDayNotificationEmail({
    artistName,
    releaseTitle: release.title,
    artworkUrl: release.artworkUrl,
    username: creator.usernameNormalized,
    slug: release.slug,
    streamingLinks: links.map(link => ({
      providerId: link.providerId,
      url: link.url,
    })),
  });

  // Send notification based on channel
  if (subscriber.channel === 'email' && subscriber.email) {
    return sendEmailNotification(ctx, { email: subscriber.email }, emailData);
  }

  if (subscriber.channel === 'sms' && subscriber.phone) {
    await updateNotificationStatus(
      ctx.notification.id,
      ctx.now,
      'failed',
      'SMS channel not yet implemented'
    );
    return 'failed';
  }

  // No valid contact info
  await updateNotificationStatus(
    ctx.notification.id,
    ctx.now,
    'failed',
    'No valid contact information'
  );
  return 'failed';
}

async function processNotificationWithErrorHandling(
  ctx: ProcessingContext
): Promise<ProcessResult> {
  try {
    return await processNotification(ctx);
  } catch (error) {
    await updateNotificationStatus(
      ctx.notification.id,
      ctx.now,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    );
    logger.error(
      '[send-release-notifications] Failed to send notification:',
      error
    );
    return 'failed';
  }
}

// ============================================================================
// API Route Handler
// ============================================================================

function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function createEmptyResponse(now: Date): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: 'No pending notifications to send',
      sent: 0,
      failed: 0,
      timestamp: now.toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}

function createSuccessResponse(
  totalSent: number,
  totalFailed: number,
  processed: number,
  now: Date
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: `Sent ${totalSent} notifications, ${totalFailed} failed`,
      sent: totalSent,
      failed: totalFailed,
      processed,
      timestamp: now.toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}

function createErrorResponse(error: unknown): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}

/**
 * Cron job to send pending release day notifications.
 *
 * This job:
 * 1. Finds pending notifications where scheduledFor <= now
 * 2. Fetches release details and streaming links
 * 3. Sends email/SMS notifications to subscribers
 * 4. Updates notification status to 'sent' or 'failed'
 *
 * Schedule: Every hour (configured in vercel.json)
 */
export async function GET(request: Request) {
  // Verify cron secret in all environments
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return createUnauthorizedResponse();
  }

  const now = new Date();
  const sendingTimeoutThreshold = new Date(now.getTime() - SENDING_TIMEOUT_MS);

  try {
    // Recovery: Reset stuck "sending" rows back to "pending" for retry
    const recoveredCount = await recoverStuckNotifications(
      now,
      sendingTimeoutThreshold
    );
    if (recoveredCount > 0) {
      logger.info(
        `[send-release-notifications] Recovered ${recoveredCount} stuck "sending" rows`
      );
    }

    // Find pending notifications that are due
    const pendingNotifications = await fetchPendingNotifications(now);

    if (pendingNotifications.length === 0) {
      logger.info('[send-release-notifications] No pending notifications');
      return createEmptyResponse(now);
    }

    // Process all notifications and count results
    let totalSent = 0;
    let totalFailed = 0;

    for (const notification of pendingNotifications) {
      const result = await processNotificationWithErrorHandling({
        now,
        notification,
      });

      if (result === 'sent') totalSent++;
      if (result === 'failed') totalFailed++;
    }

    logger.info(
      `[send-release-notifications] Sent ${totalSent} notifications, ${totalFailed} failed`
    );

    return createSuccessResponse(
      totalSent,
      totalFailed,
      pendingNotifications.length,
      now
    );
  } catch (error) {
    logger.error('[send-release-notifications] Processing failed:', error);
    return createErrorResponse(error);
  }
}

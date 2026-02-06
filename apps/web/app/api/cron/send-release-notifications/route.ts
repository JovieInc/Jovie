import { and, sql as drizzleSql, eq, lt, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getReleaseDayNotificationEmail } from '@/lib/email/templates/release-day-notification';
import { env } from '@/lib/env-server';
import { sendNotification } from '@/lib/notifications/service';
import { logger } from '@/lib/utils/logger';
import type { SenderContext } from '@/types/notifications';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Process up to 100 notifications per run to avoid timeouts
const MAX_NOTIFICATIONS_PER_RUN = 100;

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
    .limit(MAX_NOTIFICATIONS_PER_RUN);
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
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        drizzleSql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
      )
    )
    .limit(1);

  return subscriber;
}

// ============================================================================
// Batch Data Fetching
// ============================================================================

async function batchFetchReleases(releaseIds: string[]) {
  if (releaseIds.length === 0) return new Map();

  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      artworkUrl: discogReleases.artworkUrl,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(drizzleSql`${discogReleases.id} = ANY(${releaseIds})`);

  return new Map(releases.map(r => [r.id, r]));
}

async function batchFetchCreatorProfiles(creatorProfileIds: string[]) {
  if (creatorProfileIds.length === 0) return new Map();

  const creators = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(drizzleSql`${creatorProfiles.id} = ANY(${creatorProfileIds})`);

  return new Map(creators.map(c => [c.id, c]));
}

async function batchFetchSubscribers(subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) return new Map();

  const subscribers = await db
    .select({
      id: notificationSubscriptions.id,
      channel: notificationSubscriptions.channel,
      email: notificationSubscriptions.email,
      phone: notificationSubscriptions.phone,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        drizzleSql`${notificationSubscriptions.id} = ANY(${subscriptionIds})`,
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        drizzleSql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
      )
    );

  return new Map(subscribers.map(s => [s.id, s]));
}

async function batchFetchStreamingLinks(releaseIds: string[]) {
  if (releaseIds.length === 0) return new Map();

  const links = await db
    .select({
      releaseId: providerLinks.releaseId,
      providerId: providerLinks.providerId,
      url: providerLinks.url,
    })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        drizzleSql`${providerLinks.releaseId} = ANY(${releaseIds})`
      )
    );

  // Group links by release ID
  const linksMap = new Map<
    string,
    Array<{ providerId: string; url: string }>
  >();
  for (const link of links) {
    // Skip links with null releaseId
    if (!link.releaseId) continue;

    const releaseLinks = linksMap.get(link.releaseId) ?? [];
    releaseLinks.push({
      providerId: link.providerId,
      url: link.url,
    });
    linksMap.set(link.releaseId, releaseLinks);
  }

  return linksMap;
}

// ============================================================================
// Notification Processing
// ============================================================================

async function sendEmailNotification(
  ctx: ProcessingContext,
  subscriber: { email: string },
  emailData: { subject: string; text: string; html: string },
  senderContext: SenderContext
): Promise<ProcessResult> {
  const result = await sendNotification(
    {
      id: ctx.notification.id,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      channels: ['email'],
      category: 'marketing',
      senderContext,
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

async function processNotificationWithBatchedData(
  ctx: ProcessingContext,
  releasesMap: Map<
    string,
    NonNullable<Awaited<ReturnType<typeof fetchReleaseDetails>>>
  >,
  creatorsMap: Map<
    string,
    NonNullable<Awaited<ReturnType<typeof fetchCreatorProfile>>>
  >,
  subscribersMap: Map<
    string,
    NonNullable<Awaited<ReturnType<typeof fetchActiveSubscriber>>>
  >,
  linksMap: Map<string, Array<{ providerId: string; url: string }>>
): Promise<ProcessResult> {
  try {
    // Atomically claim the notification
    const claimed = await claimNotification(ctx.notification.id, ctx.now);
    if (!claimed) {
      return 'skipped';
    }

    // Get pre-fetched release details
    const release = releasesMap.get(ctx.notification.releaseId);
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

    // Get pre-fetched creator profile
    const creator = creatorsMap.get(ctx.notification.creatorProfileId);
    if (!creator) {
      throw new Error(
        `Creator not found: ${ctx.notification.creatorProfileId}`
      );
    }

    // Get pre-fetched subscriber (also verifies they haven't unsubscribed)
    const subscriber = subscribersMap.get(
      ctx.notification.notificationSubscriptionId
    );
    if (!subscriber) {
      await updateNotificationStatus(ctx.notification.id, ctx.now, 'cancelled');
      return 'skipped';
    }

    // Get pre-fetched streaming links
    const links = linksMap.get(release.id) ?? [];

    // Build email content
    const artistName = creator.displayName ?? creator.username;
    const emailData = getReleaseDayNotificationEmail({
      artistName,
      releaseTitle: release.title,
      artworkUrl: release.artworkUrl,
      username: creator.usernameNormalized,
      slug: release.slug,
      streamingLinks: links,
    });

    // Build sender context for "Artist Name via Jovie" emails
    const senderContext: SenderContext = {
      creatorProfileId: creator.id,
      displayName: artistName,
      emailType: 'release_notification',
      referenceId: release.id,
    };

    // Send notification based on channel
    if (subscriber.channel === 'email' && subscriber.email) {
      return sendEmailNotification(
        ctx,
        { email: subscriber.email },
        emailData,
        senderContext
      );
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

    // Batch fetch all required data upfront
    const releaseIds = [...new Set(pendingNotifications.map(n => n.releaseId))];
    const creatorProfileIds = [
      ...new Set(pendingNotifications.map(n => n.creatorProfileId)),
    ];
    const subscriptionIds = [
      ...new Set(pendingNotifications.map(n => n.notificationSubscriptionId)),
    ];

    const [releasesMap, creatorsMap, subscribersMap, linksMap] =
      await Promise.all([
        batchFetchReleases(releaseIds),
        batchFetchCreatorProfiles(creatorProfileIds),
        batchFetchSubscribers(subscriptionIds),
        batchFetchStreamingLinks(releaseIds),
      ]);

    // Process notifications in parallel batches
    let totalSent = 0;
    let totalFailed = 0;
    const CONCURRENCY_BATCH_SIZE = 10;

    for (
      let i = 0;
      i < pendingNotifications.length;
      i += CONCURRENCY_BATCH_SIZE
    ) {
      const batch = pendingNotifications.slice(i, i + CONCURRENCY_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(notification =>
          processNotificationWithBatchedData(
            { now, notification },
            releasesMap,
            creatorsMap,
            subscribersMap,
            linksMap
          )
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value === 'sent') totalSent++;
          if (result.value === 'failed') totalFailed++;
        } else {
          totalFailed++;
        }
      }
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

import { and, sql as drizzleSql, eq, lt, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getReleaseDayNotificationEmail } from '@/lib/email/templates/release-day-notification';
import { getBatchCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { captureError } from '@/lib/error-tracking';
import {
  getReleaseNotificationEligibility,
  type ReleaseNotificationEligibilityReason,
} from '@/lib/notifications/release-eligibility';
import { sendNotification } from '@/lib/notifications/service';
import { toISOStringSafe } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import type { SenderContext } from '@/types/notifications';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Process up to 200 notifications per run, enough for one frequent-cron slice.
const MAX_NOTIFICATIONS_PER_RUN = 200;

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

type ProcessResult = 'sent' | 'failed' | 'skipped';
type CreatorEntitlementEntry = {
  entitlements: {
    booleans: {
      canSendNotifications: boolean;
    };
  };
  plan: string;
};
interface ProcessingContext {
  now: Date;
  notification: PendingNotification;
}

async function getCreatorEntitlementsMap(
  creatorProfileIds: string[]
): Promise<Map<string, CreatorEntitlementEntry> | null> {
  try {
    return (await getBatchCreatorEntitlements(creatorProfileIds)) as Map<
      string,
      CreatorEntitlementEntry
    >;
  } catch (error) {
    logger.warn(
      '[send-release-notifications] Batch entitlements lookup failed, preserving pending notifications for retry',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        creatorCount: creatorProfileIds.length,
      }
    );
    return null;
  }
}

// Type aliases for batch-fetched data to simplify function signatures
type BatchRelease = {
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | null;
  sourceType: string | null;
};

type BatchCreator = {
  id: string;
  displayName: string | null;
  isClaimed: boolean | null;
  ownerUserId: string | null;
  settings: Record<string, unknown> | null;
  spotifyId: string | null;
  trialNotificationsSent: number | null;
  username: string;
  usernameNormalized: string;
};

type BatchSubscriber = {
  id: string;
  channel: string;
  email: string | null;
  phone: string | null;
  name: string | null;
};

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

async function incrementTrialNotificationCount(userId: string): Promise<void> {
  const MAX_OPTIMISTIC_LOCK_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_OPTIMISTIC_LOCK_RETRIES; attempt += 1) {
    const [currentUser] = await db
      .select({
        id: users.id,
        billingVersion: users.billingVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!currentUser) {
      logger.warn(
        '[send-release-notifications] Trial notification count update skipped for missing user',
        { userId }
      );
      return;
    }

    const updatedRows = await db
      .update(users)
      .set({
        trialNotificationsSent: drizzleSql`COALESCE(${users.trialNotificationsSent}, 0) + 1`,
        billingVersion: drizzleSql`${users.billingVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, userId),
          eq(users.billingVersion, currentUser.billingVersion)
        )
      )
      .returning({ id: users.id });

    if (updatedRows.length > 0) {
      return;
    }
  }

  logger.warn(
    '[send-release-notifications] Trial notification count update lost optimistic lock after retries',
    { userId, retries: 3 }
  );
}

async function persistTrialNotificationCount(
  notificationId: string,
  ownerUserId: string,
  trialState: {
    isTrialing: boolean;
    trialNotificationsSent: number;
  }
): Promise<void> {
  if (!trialState.isTrialing) {
    return;
  }

  trialState.trialNotificationsSent += 1;

  try {
    await incrementTrialNotificationCount(ownerUserId);
  } catch (error) {
    logger.error(
      '[send-release-notifications] Failed to persist trial notification count:',
      error
    );
    await captureError('Failed to persist trial notification count', error, {
      notificationId,
      userId: ownerUserId,
    });
  }
}

function getCancellationReason(
  reason: ReleaseNotificationEligibilityReason
): string {
  switch (reason) {
    case 'profile_not_claimed':
      return 'Profile must be claimed before notifications can send';
    case 'spotify_required':
      return 'Spotify must be connected before notifications can send';
    case 'catalog_import_pending':
      return 'Catalog import is still pending';
    case 'release_not_spotify_imported':
      return 'Release was not imported from Spotify';
    case 'notifications_disabled':
      return 'Creator cannot send notifications on current plan';
    case 'no_verified_subscribers':
      return 'No verified subscribers remain';
    case 'no_smart_link':
      return 'Release smart link is missing';
    case 'trial_exhausted':
      return 'Trial notification quota exhausted';
    case 'already_notified':
      return 'Release notification already processed';
    default:
      return 'Release notification is not eligible to send';
  }
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
      sourceType: discogReleases.sourceType,
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
      isClaimed: creatorProfiles.isClaimed,
      ownerUserId: creatorProfiles.userId,
      settings: creatorProfiles.settings,
      spotifyId: creatorProfiles.spotifyId,
      trialNotificationsSent: users.trialNotificationsSent,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
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
      name: notificationSubscriptions.name,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        drizzleSql`${notificationSubscriptions.id} = ANY(${subscriptionIds})`,
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        drizzleSql`${notificationSubscriptions.confirmedAt} IS NOT NULL`,
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
  emailData: {
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
  },
  senderContext: SenderContext
): Promise<ProcessResult> {
  const result = await sendNotification(
    {
      id: ctx.notification.id,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      headers: emailData.headers,
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
  notification: PendingNotification,
  now: Date,
  releasesMap: Map<string, BatchRelease>,
  creatorsMap: Map<string, BatchCreator>,
  subscribersMap: Map<string, BatchSubscriber>,
  linksMap: Map<string, Array<{ providerId: string; url: string }>>,
  entitlementsMap: NonNullable<
    Awaited<ReturnType<typeof getCreatorEntitlementsMap>>
  >,
  creatorTrialCounts: Map<
    string,
    {
      isTrialing: boolean;
      trialNotificationsSent: number;
    }
  >
): Promise<ProcessResult> {
  try {
    const release = releasesMap.get(notification.releaseId);
    if (!release) {
      throw new Error(`Release not found: ${notification.releaseId}`);
    }

    if (release.releaseDate && release.releaseDate > now) {
      await updateNotificationStatus(
        notification.id,
        now,
        'cancelled',
        'Release date changed to future date'
      );
      logger.info(
        `[send-release-notifications] Cancelled notification ${notification.id} - release date changed to ${toISOStringSafe(release.releaseDate)}`
      );
      return 'skipped';
    }

    const creator = creatorsMap.get(notification.creatorProfileId);
    if (!creator) {
      throw new Error(`Creator not found: ${notification.creatorProfileId}`);
    }

    const subscriber = subscribersMap.get(
      notification.notificationSubscriptionId
    );
    const links = linksMap.get(release.id) ?? [];
    const creatorEntitlements = entitlementsMap.get(
      notification.creatorProfileId
    );

    if (!creatorEntitlements) {
      throw new Error(
        `Creator entitlements missing: ${notification.creatorProfileId}`
      );
    }

    const spotifyImportStatus =
      typeof creator.settings?.spotifyImportStatus === 'string'
        ? creator.settings.spotifyImportStatus
        : null;
    const trialState = creatorTrialCounts.get(
      notification.creatorProfileId
    ) ?? {
      isTrialing: creatorEntitlements.plan === 'trial',
      trialNotificationsSent: creator.trialNotificationsSent ?? 0,
    };
    creatorTrialCounts.set(notification.creatorProfileId, trialState);

    const eligibility = getReleaseNotificationEligibility({
      canSendNotifications:
        creatorEntitlements.entitlements.booleans.canSendNotifications,
      hasSmartLink: links.length > 0,
      isClaimed: creator.isClaimed === true,
      isTrialing: trialState.isTrialing,
      releaseSourceType: release.sourceType,
      spotifyId: creator.spotifyId,
      spotifyImportStatus,
      trialNotificationsSent: trialState.trialNotificationsSent,
      verifiedSubscriberCount: subscriber ? 1 : 0,
    });

    if (!eligibility.eligible) {
      await updateNotificationStatus(
        notification.id,
        now,
        'cancelled',
        getCancellationReason(eligibility.reason)
      );
      return 'skipped';
    }

    const claimed = await claimNotification(notification.id, now);
    if (!claimed) {
      return 'skipped';
    }

    if (!subscriber) {
      await updateNotificationStatus(
        notification.id,
        now,
        'cancelled',
        'No verified subscribers remain'
      );
      return 'skipped';
    }

    const artistName = creator.displayName ?? creator.username;
    const emailData = getReleaseDayNotificationEmail({
      artistName,
      releaseTitle: release.title,
      artworkUrl: release.artworkUrl,
      username: creator.usernameNormalized,
      slug: release.slug,
      streamingLinks: links,
      subscriberName: subscriber.name,
    });

    const senderContext: SenderContext = {
      creatorProfileId: creator.id,
      displayName: artistName,
      emailType: 'release_notification',
      referenceId: release.id,
    };

    if (subscriber.channel === 'email' && subscriber.email) {
      const result = await sendEmailNotification(
        { now, notification },
        { email: subscriber.email },
        emailData,
        senderContext
      );

      if (result === 'sent' && trialState.isTrialing && creator.ownerUserId) {
        await persistTrialNotificationCount(
          notification.id,
          creator.ownerUserId,
          trialState
        );
      }

      return result;
    }

    if (subscriber.channel === 'sms' && subscriber.phone) {
      await updateNotificationStatus(
        notification.id,
        now,
        'failed',
        'SMS channel not yet implemented'
      );
      return 'failed';
    }

    await updateNotificationStatus(
      notification.id,
      now,
      'failed',
      'No valid contact information'
    );
    return 'failed';
  } catch (error) {
    await updateNotificationStatus(
      notification.id,
      now,
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

function createEmptyResponse(now: Date): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: 'No pending notifications to send',
      sent: 0,
      failed: 0,
      skipped: 0,
      processed: 0,
      timestamp: now.toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}

function createSuccessResponse(
  totalSent: number,
  totalFailed: number,
  totalSkipped: number,
  processed: number,
  now: Date
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: `Sent ${totalSent}, skipped ${totalSkipped}, failed ${totalFailed}`,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
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
 * Process notifications in parallel batches and return totals.
 */
async function processNotificationBatches(
  pendingNotifications: PendingNotification[],
  now: Date,
  releasesMap: Map<string, BatchRelease>,
  creatorsMap: Map<string, BatchCreator>,
  subscribersMap: Map<string, BatchSubscriber>,
  linksMap: Map<string, Array<{ providerId: string; url: string }>>,
  entitlementsMap: NonNullable<
    Awaited<ReturnType<typeof getCreatorEntitlementsMap>>
  >
): Promise<{ totalSent: number; totalFailed: number; totalSkipped: number }> {
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const creatorTrialCounts = new Map<
    string,
    {
      isTrialing: boolean;
      trialNotificationsSent: number;
    }
  >();

  for (const notification of pendingNotifications) {
    const result = await processNotificationWithBatchedData(
      notification,
      now,
      releasesMap,
      creatorsMap,
      subscribersMap,
      linksMap,
      entitlementsMap,
      creatorTrialCounts
    );

    if (result === 'sent') {
      totalSent += 1;
      continue;
    }

    if (result === 'failed') {
      totalFailed += 1;
      continue;
    }

    totalSkipped += 1;
  }

  return { totalSent, totalFailed, totalSkipped };
}

/**
 * Core logic for sending pending release notifications.
 * Exported for use by the consolidated /api/cron/frequent handler.
 */
export async function sendPendingNotifications(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  processed: number;
}> {
  const now = new Date();
  const sendingTimeoutThreshold = new Date(now.getTime() - SENDING_TIMEOUT_MS);

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
    return { sent: 0, failed: 0, skipped: 0, processed: 0 };
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

  const entitlementsMap = await getCreatorEntitlementsMap(creatorProfileIds);
  if (!entitlementsMap) {
    throw new Error(
      'Creator entitlements lookup failed while sending release notifications'
    );
  }

  const eligibleCreatorIds = new Set(
    [...entitlementsMap.entries()]
      .filter(([, value]) => value.entitlements.booleans.canSendNotifications)
      .map(([profileId]) => profileId)
  );

  // Cancel notifications for ineligible creators
  const ineligibleNotifications = pendingNotifications.filter(
    n => !eligibleCreatorIds.has(n.creatorProfileId)
  );
  if (ineligibleNotifications.length > 0) {
    const now2 = new Date();
    await Promise.all(
      ineligibleNotifications.map(n =>
        updateNotificationStatus(
          n.id,
          now2,
          'cancelled',
          'Creator on free plan'
        )
      )
    );
    logger.info(
      `[send-release-notifications] Cancelled ${ineligibleNotifications.length} notifications for free-plan creators`
    );
  }

  // Filter to only eligible notifications
  const eligibleNotifications = pendingNotifications.filter(n =>
    eligibleCreatorIds.has(n.creatorProfileId)
  );

  if (eligibleNotifications.length === 0) {
    return {
      sent: 0,
      failed: 0,
      skipped: ineligibleNotifications.length,
      processed: pendingNotifications.length,
    };
  }

  // Process notifications in parallel batches
  const totals = await processNotificationBatches(
    eligibleNotifications,
    now,
    releasesMap,
    creatorsMap,
    subscribersMap,
    linksMap,
    entitlementsMap
  );

  logger.info(
    `[send-release-notifications] Sent ${totals.totalSent}, skipped ${totals.totalSkipped + ineligibleNotifications.length}, failed ${totals.totalFailed}`
  );

  return {
    sent: totals.totalSent,
    failed: totals.totalFailed,
    skipped: totals.totalSkipped + ineligibleNotifications.length,
    processed: pendingNotifications.length,
  };
}

/**
 * Cron job to send pending release day notifications.
 *
 * Schedule: Every 15 minutes via /api/cron/frequent
 */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/send-release-notifications',
  });
  if (authError) return authError;

  try {
    const result = await sendPendingNotifications();

    if (result.processed === 0) {
      return createEmptyResponse(new Date());
    }

    return createSuccessResponse(
      result.sent,
      result.failed,
      result.skipped,
      result.processed,
      new Date()
    );
  } catch (error) {
    logger.error('[send-release-notifications] Processing failed:', error);
    await captureError('Release notification sending cron failed', error, {
      route: '/api/cron/send-release-notifications',
      method: 'GET',
    });
    return createErrorResponse(error);
  }
}

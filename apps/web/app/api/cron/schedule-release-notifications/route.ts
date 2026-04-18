import {
  and,
  asc,
  sql as drizzleSql,
  eq,
  gt,
  gte,
  inArray,
  lte,
} from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getBatchCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { captureError } from '@/lib/error-tracking';
import { getReleaseNotificationEligibility } from '@/lib/notifications/release-eligibility';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const SCHEDULING_LOOKBACK_MS = 15 * 60 * 1000;
const SCHEDULING_LOOKAHEAD_MS = 15 * 60 * 1000;

/**
 * Cron job to schedule release day notifications around the current window.
 *
 * This job:
 * 1. Finds releases that just dropped or will drop in the next 15 minutes
 * 2. For each subscriber with releaseDay preference enabled
 * 3. Creates a fanReleaseNotifications entry scheduled for release time
 *
 * Schedule: Every 15 minutes via /api/cron/frequent
 */
/**
 * Core logic for scheduling release notifications.
 * Exported for use by the consolidated /api/cron/frequent handler.
 */
type SubscriberRow = {
  id: string;
  creatorProfileId: string;
  channel: string;
  email: string | null;
  phone: string | null;
  preferences: (typeof notificationSubscriptions.$inferSelect)['preferences'];
};

type NotificationInsertValue = {
  creatorProfileId: string;
  releaseId: string;
  notificationSubscriptionId: string;
  notificationType: 'release_day';
  scheduledFor: Date;
  status: 'pending';
  dedupKey: string;
  metadata: { releaseTitle: string | null; channel: string };
};

const SUBSCRIBER_PAGE_SIZE = 500;
const INSERT_BATCH_SIZE = 500;
const INSERT_CONCURRENCY = 5;

/**
 * Insert a batch of notification rows with conflict handling.
 * Logs and returns 0 on failure so the caller can continue.
 */
async function insertNotificationBatch(
  batch: NotificationInsertValue[],
  now: Date
): Promise<number> {
  try {
    const inserted = await db
      .insert(fanReleaseNotifications)
      .values(batch)
      .onConflictDoUpdate({
        target: fanReleaseNotifications.dedupKey,
        set: {
          scheduledFor: drizzleSql`EXCLUDED.scheduled_for`,
          status: 'pending',
          error: null,
          updatedAt: now,
        },
        setWhere: inArray(fanReleaseNotifications.status, [
          'cancelled',
          'pending',
        ]),
      })
      .returning({ id: fanReleaseNotifications.id });
    return inserted.length;
  } catch (err) {
    logger.error(
      '[schedule-release-notifications] Batch insert failed, continuing:',
      err
    );
    return 0;
  }
}

/**
 * JOV-1252 / JOV-1253 / JOV-1255:
 * Stream subscribers for a single release using keyset pagination so we never
 * hold the full subscriber list in memory. Notification rows are inserted in
 * batches as we iterate (no full cross-product array built up front), and
 * inserts run with bounded concurrency (INSERT_CONCURRENCY at a time).
 */
async function scheduleNotificationsForRelease(
  release: {
    id: string;
    creatorProfileId: string;
    title: string | null;
    releaseDate: Date;
  },
  now: Date
): Promise<number> {
  let lastId = '';
  let pendingBatch: NotificationInsertValue[] = [];
  const pendingInserts: Promise<number>[] = [];
  let totalScheduled = 0;

  const flushBatch = () => {
    if (pendingBatch.length === 0) return;
    const batchToInsert = pendingBatch;
    pendingBatch = [];
    pendingInserts.push(insertNotificationBatch(batchToInsert, now));
  };

  while (true) {
    const conditions = [
      drizzleSql`${notificationSubscriptions.creatorProfileId} = ${release.creatorProfileId}`,
      drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
      drizzleSql`${notificationSubscriptions.confirmedAt} IS NOT NULL`,
      drizzleSql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`,
    ];

    if (lastId) {
      conditions.push(gt(notificationSubscriptions.id, lastId));
    }

    const page: SubscriberRow[] = await db
      .select({
        id: notificationSubscriptions.id,
        creatorProfileId: notificationSubscriptions.creatorProfileId,
        channel: notificationSubscriptions.channel,
        email: notificationSubscriptions.email,
        phone: notificationSubscriptions.phone,
        preferences: notificationSubscriptions.preferences,
      })
      .from(notificationSubscriptions)
      .where(and(...conditions))
      .orderBy(asc(notificationSubscriptions.id))
      .limit(SUBSCRIBER_PAGE_SIZE);

    for (const subscriber of page) {
      pendingBatch.push({
        creatorProfileId: release.creatorProfileId,
        releaseId: release.id,
        notificationSubscriptionId: subscriber.id,
        notificationType: 'release_day',
        scheduledFor: release.releaseDate,
        status: 'pending',
        dedupKey: `release_day:${release.id}:${subscriber.id}`,
        metadata: {
          releaseTitle: release.title,
          channel: subscriber.channel,
        },
      });

      if (pendingBatch.length >= INSERT_BATCH_SIZE) {
        flushBatch();
      }
    }

    if (page.length < SUBSCRIBER_PAGE_SIZE) break;
    const lastPageRow = page.at(-1);
    if (!lastPageRow) break;
    lastId = lastPageRow.id;

    // Drain completed inserts when concurrency ceiling is reached
    if (pendingInserts.length >= INSERT_CONCURRENCY) {
      const counts = await Promise.all(pendingInserts.splice(0));
      totalScheduled += counts.reduce((a, b) => a + b, 0);
    }
  }

  // Flush remaining rows and await all in-flight inserts in parallel
  flushBatch();
  const counts = await Promise.all(pendingInserts);
  totalScheduled += counts.reduce((a, b) => a + b, 0);

  return totalScheduled;
}
export async function scheduleReleaseNotifications(): Promise<{
  scheduled: number;
  releasesFound: number;
}> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - SCHEDULING_LOOKBACK_MS);
  const windowEnd = new Date(now.getTime() + SCHEDULING_LOOKAHEAD_MS);

  const upcomingReleases = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
      sourceType: discogReleases.sourceType,
    })
    .from(discogReleases)
    .where(
      and(
        gte(discogReleases.releaseDate, windowStart),
        lte(discogReleases.releaseDate, windowEnd)
      )
    );

  if (upcomingReleases.length === 0) {
    logger.info('[schedule-release-notifications] No upcoming releases found');
    return { scheduled: 0, releasesFound: 0 };
  }

  const creatorProfileIds = [
    ...new Set(upcomingReleases.map(r => r.creatorProfileId)),
  ];
  const releaseIds = [...new Set(upcomingReleases.map(r => r.id))];

  let entitlementsMap: Awaited<ReturnType<typeof getBatchCreatorEntitlements>>;
  try {
    entitlementsMap = await getBatchCreatorEntitlements(creatorProfileIds);
  } catch (error) {
    logger.warn(
      '[schedule-release-notifications] Batch entitlements lookup failed, preserving releases for retry',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        creatorCount: creatorProfileIds.length,
      }
    );
    throw new Error(
      'Creator entitlements lookup failed while scheduling release notifications'
    );
  }

  const [creatorRows, smartLinkRows] = await Promise.all([
    db
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        settings: creatorProfiles.settings,
        spotifyId: creatorProfiles.spotifyId,
        trialNotificationsSent: users.trialNotificationsSent,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(drizzleSql`${creatorProfiles.id} = ANY(${creatorProfileIds})`),
    db
      .select({
        releaseId: providerLinks.releaseId,
      })
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          drizzleSql`${providerLinks.releaseId} = ANY(${releaseIds})`
        )
      ),
  ]);

  const subscriberCountRows = await db
    .select({
      creatorProfileId: notificationSubscriptions.creatorProfileId,
      verifiedSubscriberCount: drizzleSql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(notificationSubscriptions)
    .where(
      and(
        drizzleSql`${notificationSubscriptions.creatorProfileId} = ANY(${creatorProfileIds})`,
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        drizzleSql`${notificationSubscriptions.confirmedAt} IS NOT NULL`,
        drizzleSql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
      )
    )
    .groupBy(notificationSubscriptions.creatorProfileId);

  const eligibleCreatorIds = new Set(
    [...entitlementsMap.entries()]
      .filter(([, value]) => value.entitlements.booleans.canSendNotifications)
      .map(([profileId]) => profileId)
  );

  const creatorMap = new Map(creatorRows.map(row => [row.id, row]));
  const subscriberCountMap = new Map(
    subscriberCountRows.map(row => [
      row.creatorProfileId,
      row.verifiedSubscriberCount,
    ])
  );
  const smartLinkReleaseIds = new Set(
    smartLinkRows.flatMap(row => (row.releaseId ? [row.releaseId] : []))
  );

  const eligibleReleases = upcomingReleases.filter(release => {
    if (!eligibleCreatorIds.has(release.creatorProfileId)) {
      return false;
    }

    const creator = creatorMap.get(release.creatorProfileId);
    const entitlements = entitlementsMap.get(release.creatorProfileId);
    if (!creator || !entitlements) {
      return false;
    }

    const spotifyImportStatus =
      typeof creator.settings?.spotifyImportStatus === 'string'
        ? creator.settings.spotifyImportStatus
        : null;
    const eligibility = getReleaseNotificationEligibility({
      canSendNotifications:
        entitlements.entitlements.booleans.canSendNotifications,
      hasSmartLink: smartLinkReleaseIds.has(release.id),
      isClaimed: creator.isClaimed === true,
      isTrialing: entitlements.plan === 'trial',
      releaseSourceType: release.sourceType,
      spotifyId: creator.spotifyId,
      spotifyImportStatus,
      trialNotificationsSent: creator.trialNotificationsSent ?? 0,
      verifiedSubscriberCount:
        subscriberCountMap.get(release.creatorProfileId) ?? 0,
    });

    return eligibility.eligible;
  });
  const skippedCount = upcomingReleases.length - eligibleReleases.length;
  if (skippedCount > 0) {
    logger.info(
      `[schedule-release-notifications] Skipped ${skippedCount} ineligible releases`
    );
  }

  if (eligibleReleases.length === 0) {
    logger.info(
      '[schedule-release-notifications] No eligible releases after eligibility checks'
    );
    return { scheduled: 0, releasesFound: upcomingReleases.length };
  }

  // Stream subscribers per-release, insert in parallel batches as we go
  let totalScheduled = 0;
  for (const release of eligibleReleases) {
    const { releaseDate } = release;
    if (!releaseDate) continue;
    try {
      const count = await scheduleNotificationsForRelease(
        { ...release, releaseDate },
        now
      );
      totalScheduled += count;
    } catch (err) {
      logger.error(
        `[schedule-release-notifications] Failed to schedule notifications for release ${release.id}:`,
        err
      );
      // Continue processing remaining releases
    }
  }

  logger.info(
    `[schedule-release-notifications] Processed ${totalScheduled} notifications for ${upcomingReleases.length} releases`
  );

  return { scheduled: totalScheduled, releasesFound: upcomingReleases.length };
}

/**
 * Cron job to schedule release day notifications for upcoming releases.
 *
 * Schedule: On demand or via the consolidated /api/cron/frequent handler
 */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/schedule-release-notifications',
  });
  if (authError) return authError;

  try {
    const result = await scheduleReleaseNotifications();

    return NextResponse.json(
      {
        success: true,
        message:
          result.releasesFound === 0
            ? 'No release notifications to schedule in the current window'
            : `Processed ${result.scheduled} notifications`,
        scheduled: result.scheduled,
        releasesFound: result.releasesFound,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[schedule-release-notifications] Scheduling failed:', error);
    await captureError('Release notification scheduling cron failed', error, {
      route: '/api/cron/schedule-release-notifications',
      method: 'GET',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scheduling failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import {
  and,
  asc,
  sql as drizzleSql,
  gt,
  gte,
  inArray,
  lte,
} from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { getBatchCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Cron job to schedule release day notifications for upcoming releases.
 *
 * This job:
 * 1. Finds releases dropping in the next 24 hours
 * 2. For each subscriber with releaseDay preference enabled
 * 3. Creates a fanReleaseNotifications entry scheduled for release time
 *
 * Schedule: Daily at 00:00 UTC (configured in vercel.json)
 */
/**
 * Core logic for scheduling release notifications.
 * Exported for use by the consolidated /api/cron/daily-maintenance handler.
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

/** Fetch eligible creator IDs based on plan entitlements. */
async function getEligibleCreatorIds(
  creatorProfileIds: string[]
): Promise<Set<string>> {
  const eligible = new Set<string>();
  try {
    const entitlementsMap =
      await getBatchCreatorEntitlements(creatorProfileIds);
    for (const [profileId, { entitlements }] of entitlementsMap) {
      if (entitlements.booleans.canSendNotifications) {
        eligible.add(profileId);
      }
    }
  } catch {
    logger.warn(
      '[schedule-release-notifications] Batch entitlements lookup failed, skipping all creators'
    );
  }
  return eligible;
}

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
    lastId = page[page.length - 1].id;

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
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcomingReleases = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(
      and(
        gte(discogReleases.releaseDate, now),
        lte(discogReleases.releaseDate, in24Hours)
      )
    );

  if (upcomingReleases.length === 0) {
    logger.info('[schedule-release-notifications] No upcoming releases found');
    return { scheduled: 0, releasesFound: 0 };
  }

  const creatorProfileIds = [
    ...new Set(upcomingReleases.map(r => r.creatorProfileId)),
  ];

  const eligibleCreatorIds = await getEligibleCreatorIds(creatorProfileIds);

  // Filter to only eligible releases
  const eligibleReleases = upcomingReleases.filter(r =>
    eligibleCreatorIds.has(r.creatorProfileId)
  );
  const skippedCount = upcomingReleases.length - eligibleReleases.length;
  if (skippedCount > 0) {
    logger.info(
      `[schedule-release-notifications] Skipped ${skippedCount} releases from free-plan creators`
    );
  }

  if (eligibleReleases.length === 0) {
    logger.info(
      '[schedule-release-notifications] No eligible releases after plan check'
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
 * Schedule: Daily at 00:00 UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await scheduleReleaseNotifications();

    return NextResponse.json(
      {
        success: true,
        message:
          result.releasesFound === 0
            ? 'No upcoming releases in the next 24 hours'
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

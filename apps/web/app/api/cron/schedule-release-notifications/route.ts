import { and, sql as drizzleSql, gte, inArray, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
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
    logger.info(
      '[schedule-release-notifications] No upcoming releases found'
    );
    return { scheduled: 0, releasesFound: 0 };
  }

  let totalScheduled = 0;

  const creatorProfileIds = [
    ...new Set(upcomingReleases.map(r => r.creatorProfileId)),
  ];

  const allSubscribers = await db
    .select({
      id: notificationSubscriptions.id,
      creatorProfileId: notificationSubscriptions.creatorProfileId,
      channel: notificationSubscriptions.channel,
      email: notificationSubscriptions.email,
      phone: notificationSubscriptions.phone,
      preferences: notificationSubscriptions.preferences,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        inArray(
          notificationSubscriptions.creatorProfileId,
          creatorProfileIds
        ),
        drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
        drizzleSql`${notificationSubscriptions.confirmedAt} IS NOT NULL`,
        drizzleSql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
      )
    );

  const subscribersByCreator = new Map<
    string,
    (typeof allSubscribers)[number][]
  >();
  for (const subscriber of allSubscribers) {
    const existing = subscribersByCreator.get(subscriber.creatorProfileId);
    if (existing) {
      existing.push(subscriber);
    } else {
      subscribersByCreator.set(subscriber.creatorProfileId, [subscriber]);
    }
  }

  const notificationValues: Array<{
    creatorProfileId: string;
    releaseId: string;
    notificationSubscriptionId: string;
    notificationType: 'release_day';
    scheduledFor: Date;
    status: 'pending';
    dedupKey: string;
    metadata: { releaseTitle: string | null; channel: string };
  }> = [];

  for (const release of upcomingReleases) {
    if (!release.releaseDate) continue;

    const subscribers =
      subscribersByCreator.get(release.creatorProfileId) || [];

    for (const subscriber of subscribers) {
      const dedupKey = `release_day:${release.id}:${subscriber.id}`;

      notificationValues.push({
        creatorProfileId: release.creatorProfileId,
        releaseId: release.id,
        notificationSubscriptionId: subscriber.id,
        notificationType: 'release_day',
        scheduledFor: release.releaseDate,
        status: 'pending',
        dedupKey,
        metadata: {
          releaseTitle: release.title,
          channel: subscriber.channel,
        },
      });
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < notificationValues.length; i += BATCH_SIZE) {
    const batch = notificationValues.slice(i, i + BATCH_SIZE);
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

    totalScheduled += inserted.length;
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
        message: result.releasesFound === 0
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

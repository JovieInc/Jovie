import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  db,
  discogReleases,
  fanReleaseNotifications,
  notificationSubscriptions,
} from '@/lib/db';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const CRON_SECRET = process.env.CRON_SECRET;

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
export async function GET(request: Request) {
  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    // Find releases dropping in the next 24 hours
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
          gt(discogReleases.releaseDate, now),
          lt(discogReleases.releaseDate, in24Hours)
        )
      );

    if (upcomingReleases.length === 0) {
      logger.info(
        '[schedule-release-notifications] No upcoming releases found'
      );
      return NextResponse.json(
        {
          success: true,
          message: 'No upcoming releases in the next 24 hours',
          scheduled: 0,
          timestamp: now.toISOString(),
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    let totalScheduled = 0;
    let totalSkipped = 0;

    // Process each release
    for (const release of upcomingReleases) {
      if (!release.releaseDate) continue;

      // Find subscribers for this creator with releaseDay preference enabled
      const subscribers = await db
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
            eq(
              notificationSubscriptions.creatorProfileId,
              release.creatorProfileId
            ),
            sql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
            sql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
          )
        );

      for (const subscriber of subscribers) {
        // Create a unique dedup key to prevent duplicate notifications
        const dedupKey = `release_day:${release.id}:${subscriber.id}`;

        try {
          // Insert notification entry (will fail silently on duplicate)
          await db
            .insert(fanReleaseNotifications)
            .values({
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
            })
            .onConflictDoNothing({ target: fanReleaseNotifications.dedupKey });

          totalScheduled++;
        } catch (error) {
          // Skip duplicates and log other errors
          if (
            error instanceof Error &&
            error.message.includes('duplicate key')
          ) {
            totalSkipped++;
          } else {
            logger.error(
              '[schedule-release-notifications] Failed to schedule notification:',
              error
            );
          }
        }
      }
    }

    logger.info(
      `[schedule-release-notifications] Scheduled ${totalScheduled} notifications, skipped ${totalSkipped} duplicates`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Scheduled ${totalScheduled} release notifications`,
        scheduled: totalScheduled,
        skipped: totalSkipped,
        releasesProcessed: upcomingReleases.length,
        timestamp: now.toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[schedule-release-notifications] Scheduling failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scheduling failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

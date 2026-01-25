import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  db,
  discogReleases,
  fanReleaseNotifications,
  notificationSubscriptions,
} from '@/lib/db';
import { env } from '@/lib/env';
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
export async function GET(request: Request) {
  // Verify cron secret in all environments
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
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
          gte(discogReleases.releaseDate, now),
          lte(discogReleases.releaseDate, in24Hours)
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

        // Insert notification entry
        // Use onConflictDoUpdate to handle rescheduled releases:
        // - If the notification exists and was cancelled (e.g., release date changed),
        //   update it back to pending with the new scheduledFor date
        // - If it's already pending/sending/sent, keep the existing record
        const inserted = await db
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
          .onConflictDoUpdate({
            target: fanReleaseNotifications.dedupKey,
            set: {
              scheduledFor: release.releaseDate,
              status: 'pending',
              error: null,
              updatedAt: now,
            },
            // Update if cancelled OR pending (to handle rescheduled releases)
            // Don't touch sent/sending notifications
            setWhere: inArray(fanReleaseNotifications.status, [
              'cancelled',
              'pending',
            ]),
          })
          .returning({ id: fanReleaseNotifications.id });

        if (inserted.length > 0) {
          totalScheduled++;
        }
      }
    }

    logger.info(
      `[schedule-release-notifications] Processed ${totalScheduled} notifications for ${upcomingReleases.length} releases`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${totalScheduled} notifications`,
        processed: totalScheduled,
        releasesFound: upcomingReleases.length,
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

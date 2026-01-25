import { and, eq, lte, sql } from 'drizzle-orm';
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const now = new Date();

  try {
    // Find pending notifications that are due
    const pendingNotifications = await db
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
          lte(fanReleaseNotifications.scheduledFor, now)
        )
      )
      .orderBy(
        fanReleaseNotifications.scheduledFor,
        fanReleaseNotifications.createdAt
      )
      .limit(BATCH_SIZE);

    if (pendingNotifications.length === 0) {
      logger.info('[send-release-notifications] No pending notifications');
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

    let totalSent = 0;
    let totalFailed = 0;

    // Process each notification
    for (const notification of pendingNotifications) {
      try {
        // Atomically claim the notification to prevent duplicate processing
        // Only update if status is still 'pending' to handle concurrent cron runs
        const claimed = await db
          .update(fanReleaseNotifications)
          .set({ status: 'sending', updatedAt: now })
          .where(
            and(
              eq(fanReleaseNotifications.id, notification.id),
              eq(fanReleaseNotifications.status, 'pending')
            )
          )
          .returning({ id: fanReleaseNotifications.id });

        // Skip if already processed/claimed by another cron run
        if (claimed.length === 0) {
          continue;
        }

        // Fetch release details including releaseDate to validate timing
        const [release] = await db
          .select({
            id: discogReleases.id,
            title: discogReleases.title,
            slug: discogReleases.slug,
            artworkUrl: discogReleases.artworkUrl,
            releaseDate: discogReleases.releaseDate,
          })
          .from(discogReleases)
          .where(eq(discogReleases.id, notification.releaseId))
          .limit(1);

        if (!release) {
          throw new Error(`Release not found: ${notification.releaseId}`);
        }

        // Validate release date hasn't changed to a future date
        // If the release was rescheduled to the future, cancel this notification
        if (release.releaseDate && release.releaseDate > now) {
          await db
            .update(fanReleaseNotifications)
            .set({
              status: 'cancelled',
              error: 'Release date changed to future date',
              updatedAt: now,
            })
            .where(eq(fanReleaseNotifications.id, notification.id));
          logger.info(
            `[send-release-notifications] Cancelled notification ${notification.id} - release date changed to ${release.releaseDate.toISOString()}`
          );
          continue;
        }

        // Fetch creator profile
        const [creator] = await db
          .select({
            id: creatorProfiles.id,
            displayName: creatorProfiles.displayName,
            username: creatorProfiles.username,
            usernameNormalized: creatorProfiles.usernameNormalized,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, notification.creatorProfileId))
          .limit(1);

        if (!creator) {
          throw new Error(
            `Creator not found: ${notification.creatorProfileId}`
          );
        }

        // Fetch subscriber details
        // Also verify releaseDay preference is still enabled to honor opt-outs after scheduling
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
              eq(
                notificationSubscriptions.id,
                notification.notificationSubscriptionId
              ),
              sql`${notificationSubscriptions.unsubscribedAt} IS NULL`,
              sql`(${notificationSubscriptions.preferences}->>'releaseDay')::boolean = true`
            )
          )
          .limit(1);

        if (!subscriber) {
          // Subscriber unsubscribed or disabled releaseDay preference, cancel notification
          await db
            .update(fanReleaseNotifications)
            .set({ status: 'cancelled', updatedAt: now })
            .where(eq(fanReleaseNotifications.id, notification.id));
          continue;
        }

        // Fetch streaming links for the release
        const links = await db
          .select({
            providerId: providerLinks.providerId,
            url: providerLinks.url,
          })
          .from(providerLinks)
          .where(
            and(
              eq(providerLinks.ownerType, 'release'),
              eq(providerLinks.releaseId, release.id)
            )
          );

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
          const result = await sendNotification(
            {
              id: notification.id,
              subject: emailData.subject,
              text: emailData.text,
              html: emailData.html,
              channels: ['email'],
              category: 'marketing',
            },
            {
              email: subscriber.email,
            }
          );

          const success = result.delivered.length > 0;

          await db
            .update(fanReleaseNotifications)
            .set({
              status: success ? 'sent' : 'failed',
              sentAt: success ? now : null,
              error: success
                ? null
                : (result.errors[0]?.error ?? 'Unknown error'),
              updatedAt: now,
            })
            .where(eq(fanReleaseNotifications.id, notification.id));

          if (success) {
            totalSent++;
          } else {
            totalFailed++;
          }
        } else if (subscriber.channel === 'sms' && subscriber.phone) {
          // SMS not yet implemented - mark as failed with note
          await db
            .update(fanReleaseNotifications)
            .set({
              status: 'failed',
              error: 'SMS channel not yet implemented',
              updatedAt: now,
            })
            .where(eq(fanReleaseNotifications.id, notification.id));
          totalFailed++;
        } else {
          // No valid contact info
          await db
            .update(fanReleaseNotifications)
            .set({
              status: 'failed',
              error: 'No valid contact information',
              updatedAt: now,
            })
            .where(eq(fanReleaseNotifications.id, notification.id));
          totalFailed++;
        }
      } catch (error) {
        // Mark notification as failed
        await db
          .update(fanReleaseNotifications)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: now,
          })
          .where(eq(fanReleaseNotifications.id, notification.id));

        logger.error(
          '[send-release-notifications] Failed to send notification:',
          error
        );
        totalFailed++;
      }
    }

    logger.info(
      `[send-release-notifications] Sent ${totalSent} notifications, ${totalFailed} failed`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Sent ${totalSent} notifications, ${totalFailed} failed`,
        sent: totalSent,
        failed: totalFailed,
        processed: pendingNotifications.length,
        timestamp: now.toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[send-release-notifications] Processing failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

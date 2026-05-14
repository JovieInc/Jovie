import { and, sql as drizzleSql, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  audienceMembers,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';

type AlertChannel = 'sms' | 'email' | 'push';

interface AlertContact {
  readonly email?: string | null;
  readonly phone?: string | null;
}

/**
 * Recompute the denormalized alert summary on `audience_members` for a single
 * (creator_profile_id, contact) pair after a notification_subscriptions write.
 *
 * "Active" means: confirmed_at IS NOT NULL AND unsubscribed_at IS NULL.
 *
 * Always reads the canonical state from `notification_subscriptions` instead
 * of patching deltas — this keeps the denormalized columns truthful under
 * concurrent writes and webhook retries.
 *
 * Best-effort: surfaces the error to Sentry but does not throw, since the
 * subscription write itself has already succeeded and the audience row is a
 * UI-only mirror that the next backfill / write will reconcile.
 */
export async function syncAudienceAlertState(
  creatorProfileId: string,
  contact: AlertContact
): Promise<void> {
  const email = contact.email?.trim().toLowerCase() || null;
  const phone = contact.phone?.trim() || null;

  if (!email && !phone) return;

  try {
    const matchClauses = [];
    if (phone) {
      matchClauses.push(eq(notificationSubscriptions.phone, phone));
    }
    if (email) {
      matchClauses.push(
        drizzleSql`lower(${notificationSubscriptions.email}) = ${email}`
      );
    }

    const activeRows = await db
      .select({
        channel: notificationSubscriptions.channel,
        confirmedAt: notificationSubscriptions.confirmedAt,
      })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, creatorProfileId),
          isNotNull(notificationSubscriptions.confirmedAt),
          isNull(notificationSubscriptions.unsubscribedAt),
          or(...matchClauses)!
        )
      );

    const channelSet = new Set<AlertChannel>();
    let lastConfirmedAt: Date | null = null;
    for (const row of activeRows) {
      channelSet.add(row.channel as AlertChannel);
      if (
        row.confirmedAt &&
        (!lastConfirmedAt || row.confirmedAt > lastConfirmedAt)
      ) {
        lastConfirmedAt = row.confirmedAt;
      }
    }
    const channels = [...channelSet].sort((left, right) =>
      left.localeCompare(right)
    );
    const hasActive = channels.length > 0;

    const audienceMatchClauses = [];
    if (phone) {
      audienceMatchClauses.push(eq(audienceMembers.phone, phone));
    }
    if (email) {
      audienceMatchClauses.push(
        drizzleSql`lower(${audienceMembers.email}) = ${email}`
      );
    }

    await db
      .update(audienceMembers)
      .set({
        hasActiveAlerts: hasActive,
        activeAlertChannels: channels,
        lastAlertConfirmedAt: lastConfirmedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(audienceMembers.creatorProfileId, creatorProfileId),
          or(...audienceMatchClauses)!
        )
      );
  } catch (error) {
    void captureError(
      'Failed to sync audience alert state',
      error instanceof Error ? error : new Error(String(error)),
      {
        creatorProfileId,
        emailPresent: Boolean(email),
        phonePresent: Boolean(phone),
      }
    );
  }
}

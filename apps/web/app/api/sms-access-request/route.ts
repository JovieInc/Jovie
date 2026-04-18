/**
 * SMS Notification Early Access Request API
 *
 * Allows authenticated Pro artists to request SMS notification access.
 * Stores the request on the creator profile and sends a Slack notification.
 */

import { and, count, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { notifySlackSmsAccessRequest } from '@/lib/notifications/providers/slack';
import { logger } from '@/lib/utils/logger';

export async function POST() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    // Look up user and their active creator profile
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isPro: users.isPro,
      })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!user.isPro) {
      return NextResponse.json(
        { error: 'SMS notifications require a Pro plan' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        smsAccessRequestedAt: creatorProfiles.smsAccessRequestedAt,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (profile.smsAccessRequestedAt) {
      return NextResponse.json(
        { error: 'You have already requested SMS access' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Atomic update with WHERE sms_access_requested_at IS NULL to prevent races
    const [updated] = await db
      .update(creatorProfiles)
      .set({
        smsAccessRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creatorProfiles.id, profile.id),
          isNull(creatorProfiles.smsAccessRequestedAt)
        )
      )
      .returning({ id: creatorProfiles.id });

    if (!updated) {
      return NextResponse.json(
        { error: 'You have already requested SMS access' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Get SMS subscriber count for the Slack notification
    const [subCount] = await db
      .select({ value: count() })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, profile.id),
          eq(notificationSubscriptions.channel, 'sms')
        )
      );

    const profileUrl = `https://jov.ie/${profile.username}`;

    // Send Slack notification (fire and forget)
    notifySlackSmsAccessRequest(
      profile.displayName ?? 'Unknown',
      user.email ?? 'No email',
      profileUrl,
      subCount?.value ?? 0
    ).catch(err => {
      logger.error('[sms-access] Failed to send Slack notification', err);
    });

    logger.info('[sms-access] Request submitted', {
      userId: user.id,
      profileId: profile.id,
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error('[sms-access] Request failed', err);
    captureError('SMS access request failed', err, {
      route: '/api/sms-access-request',
    });
    return NextResponse.json(
      { error: 'Failed to submit request' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

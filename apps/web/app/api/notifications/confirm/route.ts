import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { verifySubscribeConfirmToken } from '@/lib/email/subscribe-confirm-token';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

/**
 * GET /api/notifications/confirm?token=<token>
 *
 * Confirms a pending email subscription via double opt-in.
 * Verifies the HMAC token, sets confirmedAt, and redirects to the artist profile.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const baseUrl = APP_URL.replace(/\/$/, '');

  if (!token) {
    return NextResponse.redirect(`${baseUrl}?error=invalid_token`);
  }

  const decoded = verifySubscribeConfirmToken(token);
  if (!decoded) {
    return NextResponse.redirect(`${baseUrl}?error=invalid_token`);
  }

  try {
    // Look up the subscription
    const [subscription] = await db
      .select({
        id: notificationSubscriptions.id,
        creatorProfileId: notificationSubscriptions.creatorProfileId,
        confirmedAt: notificationSubscriptions.confirmedAt,
        email: notificationSubscriptions.email,
      })
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.id, decoded.subscriptionId))
      .limit(1);

    if (!subscription) {
      return NextResponse.redirect(`${baseUrl}?error=subscription_not_found`);
    }

    // Verify email matches
    if (subscription.email !== decoded.email) {
      return NextResponse.redirect(`${baseUrl}?error=invalid_token`);
    }

    // Already confirmed — still redirect to success
    if (!subscription.confirmedAt) {
      await db
        .update(notificationSubscriptions)
        .set({
          confirmedAt: new Date(),
          confirmationToken: null, // Clear token after use
        })
        .where(eq(notificationSubscriptions.id, subscription.id));
    }

    // Look up the creator's username for the redirect
    const [creator] = await db
      .select({ username: creatorProfiles.username })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, subscription.creatorProfileId))
      .limit(1);

    const username = creator?.username ?? '';
    return NextResponse.redirect(`${baseUrl}/${username}?subscribed=confirmed`);
  } catch (error) {
    logger.error('[Notifications Confirm] Error:', error);
    return NextResponse.redirect(`${baseUrl}?error=server_error`);
  }
}

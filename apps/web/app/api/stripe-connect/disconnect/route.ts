/**
 * Stripe Connect Disconnect - POST
 *
 * Removes the stripe_account_id from the artist's profile.
 * Does NOT delete the Stripe account — they can reconnect later.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

export async function POST() {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  // Check feature flag
  if (
    !(await getAppFlagValue('STRIPE_CONNECT_ENABLED', { userId: clerkUserId }))
  ) {
    return NextResponse.json(
      { error: 'Stripe Connect is not enabled' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const user = await getUserByClerkId(db, clerkUserId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Clear Stripe Connect fields — do NOT delete the Stripe account
    await db
      .update(creatorProfiles)
      .set({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripePayoutsEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    return NextResponse.json(
      { disconnected: true },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Stripe Connect disconnect failed', err, {
      clerkUserId,
    });
    return NextResponse.json(
      { error: 'Failed to disconnect Stripe Connect' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

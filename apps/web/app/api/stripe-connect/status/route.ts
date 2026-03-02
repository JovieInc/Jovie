/**
 * Stripe Connect Status - GET
 *
 * Returns the artist's Stripe Connect status including connection state,
 * onboarding completion, and payouts enablement.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { isStripeConnectEnabled } from '@/lib/feature-flags/stripe-connect';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { stripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  // Check feature flag
  const enabled = await isStripeConnectEnabled(clerkUserId);
  if (!enabled) {
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
      .select({
        id: creatorProfiles.id,
        stripeAccountId: creatorProfiles.stripeAccountId,
        stripeOnboardingComplete: creatorProfiles.stripeOnboardingComplete,
        stripePayoutsEnabled: creatorProfiles.stripePayoutsEnabled,
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

    // If no Stripe account, return disconnected status
    if (!profile.stripeAccountId) {
      return NextResponse.json(
        {
          connected: false,
          onboardingComplete: false,
          payoutsEnabled: false,
          email: null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Fetch the latest status from Stripe
    let payoutEmail: string | null = null;
    try {
      const account = await stripe.accounts.retrieve(profile.stripeAccountId);
      payoutEmail = typeof account.email === 'string' ? account.email : null;
    } catch {
      // Account may have been deleted on Stripe's side
    }

    return NextResponse.json(
      {
        connected: true,
        onboardingComplete: profile.stripeOnboardingComplete,
        payoutsEnabled: profile.stripePayoutsEnabled,
        email: payoutEmail,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Stripe Connect status check failed', err, {
      clerkUserId,
    });
    return NextResponse.json(
      { error: 'Failed to check Stripe Connect status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

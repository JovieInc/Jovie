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
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getStripeConnectReadiness } from '@/lib/stripe/connect-readiness';

export const runtime = 'nodejs';

export async function GET() {
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

    // Read readiness from cache; helper falls back to Stripe + writes through
    // when the cache is stale or empty. captureWarning is emitted internally
    // if Stripe fails on a stale cache, and the helper still returns the
    // stale flags so the dashboard never blocks on a Stripe outage.
    const readiness = await getStripeConnectReadiness(profile.stripeAccountId);

    return NextResponse.json(
      {
        connected: true,
        onboardingComplete:
          readiness?.onboardingComplete ?? profile.stripeOnboardingComplete,
        payoutsEnabled:
          readiness?.payoutsEnabled ?? profile.stripePayoutsEnabled,
        email: readiness?.payoutEmail ?? null,
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

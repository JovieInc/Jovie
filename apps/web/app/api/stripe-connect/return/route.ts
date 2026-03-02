/**
 * Stripe Connect Return - GET
 *
 * Stripe redirects here after the artist completes (or exits) the onboarding flow.
 * Checks the account status, updates the DB, and redirects to the settings page.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { stripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';

export async function GET() {
  const settingsUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/app/settings`;

  const { userId: clerkUserId, error } = await requireAuth();
  if (error) {
    // If not authenticated, redirect to settings (login will be triggered)
    return NextResponse.redirect(`${settingsUrl}?stripe_connect=error`);
  }

  try {
    const user = await getUserByClerkId(db, clerkUserId);
    if (!user) {
      return NextResponse.redirect(`${settingsUrl}?stripe_connect=error`, {
        headers: NO_STORE_HEADERS,
      });
    }

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        stripeAccountId: creatorProfiles.stripeAccountId,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, user.id))
      .limit(1);

    if (!profile?.stripeAccountId) {
      return NextResponse.redirect(`${settingsUrl}?stripe_connect=error`, {
        headers: NO_STORE_HEADERS,
      });
    }

    // Check the account status on Stripe
    const account = await stripe.accounts.retrieve(profile.stripeAccountId);

    const onboardingComplete = account.details_submitted === true;
    const payoutsEnabled = account.payouts_enabled === true;

    // Update the DB with the latest status
    await db
      .update(creatorProfiles)
      .set({
        stripeOnboardingComplete: onboardingComplete,
        stripePayoutsEnabled: payoutsEnabled,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    const status = payoutsEnabled
      ? 'success'
      : onboardingComplete
        ? 'pending'
        : 'incomplete';

    return NextResponse.redirect(`${settingsUrl}?stripe_connect=${status}`, {
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    captureError('Stripe Connect return handler failed', err, {
      clerkUserId,
    });
    return NextResponse.redirect(`${settingsUrl}?stripe_connect=error`, {
      headers: NO_STORE_HEADERS,
    });
  }
}

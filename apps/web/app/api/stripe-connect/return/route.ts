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
import { getStripeConnectReadiness } from '@/lib/stripe/connect-readiness';

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

    // The user just finished Stripe's onboarding flow — force a fresh fetch
    // and write through to the cache. The helper handles update-by-id and
    // captures a warning on Stripe failure.
    const readiness = await getStripeConnectReadiness(profile.stripeAccountId, {
      forceRefresh: true,
    });

    let status: string;
    if (readiness?.payoutsEnabled) status = 'success';
    else if (readiness?.onboardingComplete) status = 'pending';
    else status = 'incomplete';

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

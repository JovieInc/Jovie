/**
 * Stripe Connect Onboarding - POST
 *
 * Creates a Stripe Connect Express account (if the artist doesn't have one)
 * and returns an Account Link URL for the onboarding flow.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import {
  captureError,
  captureWarning,
  sanitizeErrorResponse,
} from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { stripe } from '@/lib/stripe/client';
import {
  classifyStripeConnectOnboardError,
  isStripeConnectPlatformProfileBlocked,
  STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR,
} from '@/lib/stripe/connect-errors';

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
    if (isStripeConnectPlatformProfileBlocked()) {
      const classified = STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR;
      await captureWarning(
        'Stripe Connect onboarding blocked by platform guard',
        {
          clerkUserId,
          code: classified.code,
        }
      );

      return NextResponse.json(
        sanitizeErrorResponse(classified.userMessage, undefined, {
          code: classified.code,
        }),
        {
          status: classified.status,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': RETRY_AFTER_SERVICE,
          },
        }
      );
    }

    // Get user and their creator profile
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
        displayName: creatorProfiles.displayName,
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

    let stripeAccountId = profile.stripeAccountId;

    // Create a new Express account if one doesn't exist
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: {
          jovie_profile_id: profile.id,
          clerk_user_id: clerkUserId,
        },
        ...(user.email ? { email: user.email } : {}),
        ...(profile.displayName
          ? {
              business_profile: {
                name: profile.displayName,
              },
            }
          : {}),
      });

      stripeAccountId = account.id;

      // Save the account ID to the creator profile
      await db
        .update(creatorProfiles)
        .set({
          stripeAccountId: account.id,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));
    }

    // Create an account link for the onboarding flow
    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/api/stripe-connect/onboard`,
      return_url: `${baseUrl}/api/stripe-connect/return`,
      type: 'account_onboarding',
    });

    return NextResponse.json(
      { url: accountLink.url },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    const classified = classifyStripeConnectOnboardError(err);
    const capture =
      classified.logLevel === 'warning' ? captureWarning : captureError;

    await capture('Stripe Connect onboarding failed', err, {
      clerkUserId,
      code: classified.code,
    });

    return NextResponse.json(
      sanitizeErrorResponse(classified.userMessage, undefined, {
        code: classified.code,
      }),
      {
        status: classified.status,
        headers:
          classified.status === 503
            ? { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SERVICE }
            : NO_STORE_HEADERS,
      }
    );
  }
}

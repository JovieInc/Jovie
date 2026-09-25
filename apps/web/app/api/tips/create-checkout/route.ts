import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  getClientIP,
  rateLimitDenialMessage,
  rateLimitDenialStatus,
  tipCheckoutLimiter,
} from '@/lib/rate-limit';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const createCheckoutSchema = z.object({
  profileId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(50000),
  handle: z.string().min(1).max(64),
});

const checkoutCapabilitySchema = z.union([
  z.object({ profileId: z.string().uuid() }),
  z.object({ handle: z.string().min(1).max(64) }),
]);

export async function GET(req: NextRequest) {
  const requestedProfileId = req.nextUrl.searchParams.get('profileId');
  const parsed = checkoutCapabilitySchema.safeParse(
    requestedProfileId !== null
      ? { profileId: requestedProfileId }
      : { handle: req.nextUrl.searchParams.get('handle') }
  );
  if (!parsed.success) {
    return NextResponse.json(
      { available: false },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        isPublic: creatorProfiles.isPublic,
        stripeAccountId: creatorProfiles.stripeAccountId,
        stripePayoutsEnabled: creatorProfiles.stripePayoutsEnabled,
      })
      .from(creatorProfiles)
      .where(
        'profileId' in parsed.data
          ? eq(creatorProfiles.id, parsed.data.profileId)
          : eq(creatorProfiles.username, parsed.data.handle.toLowerCase())
      )
      .limit(1);
    const stripeConnectEnabled = await getAppFlagValue(
      'STRIPE_CONNECT_ENABLED'
    );
    const available = Boolean(
      profile?.isPublic &&
        stripeConnectEnabled &&
        profile.stripeAccountId &&
        profile.stripePayoutsEnabled
    );
    return NextResponse.json(
      { available, ...(available && profile ? { profileId: profile.id } : {}) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Tip checkout capability lookup failed:', error);
    return NextResponse.json(
      { available: false },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Default platform fee percentage for tips (3%).
 * Configurable via TIP_PLATFORM_FEE_PERCENT env var.
 */
function getPlatformFeePercent(): number {
  const configured = env.TIP_PLATFORM_FEE_PERCENT;
  if (configured) {
    const parsed = Number.parseFloat(configured);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed;
    }
  }
  return 3;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP (public endpoint, no auth required)
    const ip = getClientIP(req);
    const rateLimitResult = await tipCheckoutLimiter.limit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: rateLimitDenialMessage(
            rateLimitResult,
            'Too many checkout requests. Please try again later.',
            'Checkout is temporarily unavailable. Please try again later.'
          ),
        },
        {
          status: rateLimitDenialStatus(rateLimitResult),
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    const body = await req.json();
    const parsed = createCheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, amountCents, handle } = parsed.data;

    // Look up the artist profile (including Stripe Connect fields)
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        isPublic: creatorProfiles.isPublic,
        stripeAccountId: creatorProfiles.stripeAccountId,
        stripePayoutsEnabled: creatorProfiles.stripePayoutsEnabled,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile?.isPublic) {
      return NextResponse.json(
        { error: 'Artist not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (profile.username.toLowerCase() !== handle.toLowerCase()) {
      return NextResponse.json(
        { error: 'Artist does not match checkout request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const artistName = profile.displayName || profile.username;
    const baseUrl = publicEnv.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie';

    // Calculate platform fee
    const feePercent = getPlatformFeePercent();
    const platformFeeCents = Math.round(amountCents * (feePercent / 100));

    // Build checkout session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tip for ${artistName}`,
              description: `Support ${artistName} on Jovie`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          handle: handle.toLowerCase(),
          profile_id: profileId,
          platform_fee_cents: String(platformFeeCents),
          source: 'tip_checkout',
        },
      },
      metadata: {
        handle: handle.toLowerCase(),
        profile_id: profileId,
        platform_fee_cents: String(platformFeeCents),
        source: 'tip_checkout',
      },
      success_url: `${baseUrl}/${handle}/tip/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${handle}/tip`,
    };

    const stripeConnectEnabled = await getAppFlagValue(
      'STRIPE_CONNECT_ENABLED'
    );

    // Fail closed so an unavailable creator account never routes fan money to Jovie.
    if (
      !stripeConnectEnabled ||
      !profile.stripeAccountId ||
      !profile.stripePayoutsEnabled
    ) {
      return NextResponse.json(
        { error: 'This artist cannot accept card payments yet' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const account = await stripe.accounts.retrieve(profile.stripeAccountId);
    if (
      !account.charges_enabled ||
      !account.payouts_enabled ||
      account.requirements?.currently_due?.length
    ) {
      return NextResponse.json(
        { error: 'This artist cannot accept card payments yet' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    sessionParams.payment_intent_data!.transfer_data = {
      destination: profile.stripeAccountId,
    };
    sessionParams.payment_intent_data!.application_fee_amount =
      platformFeeCents;

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { url: session.url, sessionId: session.id },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Create tip checkout error:', error);
    await captureCriticalError('Tip checkout session creation failed', error, {
      route: '/api/tips/create-checkout',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

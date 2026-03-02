import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const createCheckoutSchema = z.object({
  profileId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(50000),
  handle: z.string().min(1).max(64),
});

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
    const body = await req.json();
    const parsed = createCheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, amountCents, handle } = parsed.data;

    // Look up the artist profile
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        isPublic: creatorProfiles.isPublic,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile || !profile.isPublic) {
      return NextResponse.json(
        { error: 'Artist not found' },
        { status: 404, headers: NO_STORE_HEADERS }
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
        source: 'tip_checkout',
      },
      success_url: `${baseUrl}/${handle}/tip/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${handle}/tip`,
    };

    // Check if Stripe Connect direct transfers should be used
    // This is a future feature gated behind a feature flag
    const connectEnabled = await checkGate(
      null,
      FEATURE_FLAG_KEYS.STRIPE_CONNECT_ENABLED,
      false
    );

    if (connectEnabled) {
      // Future: look up stripe_account_id from profile and add transfer_data
      // sessionParams.payment_intent_data.transfer_data = {
      //   destination: stripeAccountId,
      // };
      // sessionParams.payment_intent_data.application_fee_amount = platformFeeCents;
      logger.info('Stripe Connect enabled but no account configured', {
        profileId,
      });
    }

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

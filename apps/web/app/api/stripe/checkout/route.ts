/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env-public';
import { captureCriticalError } from '@/lib/error-tracking';
import {
  MAX_REFERRAL_CODE_LENGTH,
  MIN_REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_PATTERN,
} from '@/lib/referrals/config';
import {
  checkExistingPlanSubscription,
  getCheckoutErrorResponse,
} from '@/lib/stripe/checkout-helpers';
import { createCheckoutSession } from '@/lib/stripe/client';
import { getActivePriceIds, getPriceMappingDetails } from '@/lib/stripe/config';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Parse request body
    const body = await request.json();
    const { priceId, referralCode: rawReferralCode } = body;

    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate and normalize referral code if provided
    let referralCode: string | undefined;
    if (typeof rawReferralCode === 'string') {
      const trimmed = rawReferralCode.trim();
      if (
        trimmed.length >= MIN_REFERRAL_CODE_LENGTH &&
        trimmed.length <= MAX_REFERRAL_CODE_LENGTH &&
        REFERRAL_CODE_PATTERN.test(trimmed)
      ) {
        referralCode = trimmed.toLowerCase();
      }
      // Silently ignore invalid referral codes — they shouldn't block checkout
    }

    // Validate that the price ID is one of our active prices
    const activePriceIds = getActivePriceIds();

    Sentry.addBreadcrumb({
      category: 'billing',
      message: 'Price validation',
      level: 'info',
      data: {
        requestedPriceId: priceId,
        activePriceIdCount: activePriceIds.length,
      },
    });

    if (activePriceIds.length === 0) {
      // Zero active prices is a config problem, not a user error
      await captureCriticalError(
        'Checkout rejected: no active price IDs configured',
        new Error(
          'getActivePriceIds() returned empty — STRIPE_PRICE_PRO_MONTHLY/YEARLY likely missing'
        ),
        { route: '/api/stripe/checkout', requestedPriceId: priceId }
      );
      return NextResponse.json(
        { error: 'Billing is temporarily unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    if (!activePriceIds.includes(priceId)) {
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Get price details for logging
    const priceDetails = getPriceMappingDetails(priceId);
    logger.info('Creating checkout session for:', {
      userId,
      priceId,
      plan: priceDetails?.plan,
      description: priceDetails?.description,
    });

    // Ensure Stripe customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      logger.error('Failed to ensure Stripe customer:', customerResult.error);
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    if (priceDetails?.plan) {
      const subscriptionCheck = await checkExistingPlanSubscription(
        customerResult.customerId,
        priceDetails.plan
      );

      if (subscriptionCheck.alreadySubscribed) {
        return NextResponse.json(
          {
            sessionId: subscriptionCheck.portalSession.id,
            url: subscriptionCheck.portalSession.url,
            alreadySubscribed: true,
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    }

    // Create URLs for success and cancel
    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/billing/success`;
    const cancelUrl = `${baseUrl}/billing/cancel`;

    const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const idempotencyKey = `checkout:${userId}:${priceId}:${idempotencyBucket}`;

    // Create checkout session
    const session = await createCheckoutSession({
      customerId: customerResult.customerId,
      priceId,
      userId,
      successUrl,
      cancelUrl,
      idempotencyKey,
      referralCode,
    });

    // Log successful checkout creation
    logger.info('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId,
      customerId: customerResult.customerId,
      url: session.url,
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    await captureCriticalError(
      'Stripe checkout session creation failed',
      error,
      {
        route: '/api/stripe/checkout',
        method: 'POST',
      }
    );

    // Return appropriate error based on the error type
    if (error instanceof Error) {
      const knownError = getCheckoutErrorResponse(error);
      if (knownError) {
        return NextResponse.json(
          { error: knownError.message },
          { status: knownError.status, headers: NO_STORE_HEADERS }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

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

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: NO_STORE_HEADERS }
  );
}

function normalizeReferralCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const isValid =
    trimmed.length >= MIN_REFERRAL_CODE_LENGTH &&
    trimmed.length <= MAX_REFERRAL_CODE_LENGTH &&
    REFERRAL_CODE_PATTERN.test(trimmed);
  return isValid ? trimmed.toLowerCase() : undefined;
}

async function validatePriceId(priceId: string): Promise<NextResponse | null> {
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
    await captureCriticalError(
      'Checkout rejected: no active price IDs configured',
      new Error(
        'getActivePriceIds() returned empty — STRIPE_PRICE_PRO_MONTHLY/YEARLY likely missing'
      ),
      { route: '/api/stripe/checkout', requestedPriceId: priceId }
    );
    return jsonError('Billing is temporarily unavailable', 503);
  }

  if (!activePriceIds.includes(priceId)) {
    return jsonError('Invalid price ID', 400);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError('Unauthorized', 401);

    const body = await request.json();
    const { priceId, referralCode: rawReferralCode } = body;

    if (!priceId || typeof priceId !== 'string') {
      return jsonError('Invalid price ID', 400);
    }

    const referralCode = normalizeReferralCode(rawReferralCode);

    const priceError = await validatePriceId(priceId);
    if (priceError) return priceError;

    const priceDetails = getPriceMappingDetails(priceId);
    logger.info('Creating checkout session for:', {
      userId,
      priceId,
      plan: priceDetails?.plan,
      description: priceDetails?.description,
    });

    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      logger.error('Failed to ensure Stripe customer:', customerResult.error);
      return jsonError('Failed to create customer', 500);
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

    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));

    const session = await createCheckoutSession({
      customerId: customerResult.customerId,
      priceId,
      userId,
      successUrl: `${baseUrl}/billing/success`,
      cancelUrl: `${baseUrl}/billing/cancel`,
      idempotencyKey: `checkout:${userId}:${priceId}:${idempotencyBucket}`,
      referralCode,
    });

    logger.info('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId,
      customerId: customerResult.customerId,
      url: session.url,
    });

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    await captureCriticalError(
      'Stripe checkout session creation failed',
      error,
      { route: '/api/stripe/checkout', method: 'POST' }
    );

    if (error instanceof Error) {
      const knownError = getCheckoutErrorResponse(error);
      if (knownError) {
        return jsonError(knownError.message, knownError.status);
      }
    }

    return jsonError('Failed to create checkout session', 500);
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

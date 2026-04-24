/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { publicEnv } from '@/lib/env-public';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { normalizeOnboardingReturnTo } from '@/lib/onboarding/return-to';
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
import {
  getActivePriceIds,
  getPriceMappingDetails,
  isMaxPlanEnabled,
  isMaxPriceId,
} from '@/lib/stripe/config';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';
import {
  isTransientStripeError,
  StripeRetryExhaustedError,
  withStripeRetry,
} from '@/lib/stripe/retry';
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

function jsonServiceUnavailable() {
  return NextResponse.json(
    {
      error:
        'Payment service is temporarily unavailable. Please try again in a moment.',
    },
    { status: 503, headers: { ...NO_STORE_HEADERS, 'Retry-After': '5' } }
  );
}

async function handleCheckoutError(error: unknown): Promise<NextResponse> {
  const retryContext =
    error instanceof StripeRetryExhaustedError
      ? {
          retryAttempts: error.attempts,
          retryOperation: error.operation,
          retryExhausted: true,
        }
      : {};

  await captureCriticalError('Stripe checkout session creation failed', error, {
    route: '/api/stripe/checkout',
    method: 'POST',
    ...retryContext,
  });

  if (error instanceof StripeRetryExhaustedError) {
    return jsonServiceUnavailable();
  }

  if (error instanceof Error) {
    const knownError = getCheckoutErrorResponse(error);
    if (knownError) {
      return jsonError(knownError.message, knownError.status);
    }
  }

  if (isTransientStripeError(error)) {
    return jsonServiceUnavailable();
  }

  return jsonError('Failed to create checkout session', 500);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) return jsonError('Unauthorized', 401);

    const parsedBody = await parseJsonBody<{
      priceId?: unknown;
      referralCode?: unknown;
      returnTo?: unknown;
      source?: unknown;
    }>(request, {
      route: '/api/stripe/checkout',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) return parsedBody.response;

    const {
      priceId,
      referralCode: rawReferralCode,
      returnTo: rawReturnTo,
      source: rawSource,
    } = parsedBody.data;
    const checkoutSource =
      rawSource === 'onboarding' ? 'onboarding' : undefined;

    if (!priceId || typeof priceId !== 'string') {
      return jsonError('Invalid price ID', 400);
    }

    const referralCode = normalizeReferralCode(rawReferralCode);
    const onboardingReturnTo = normalizeOnboardingReturnTo(rawReturnTo);

    const priceError = await validatePriceId(priceId);
    if (priceError) return priceError;

    if (!isMaxPlanEnabled() && isMaxPriceId(priceId)) {
      return jsonError('Max plan is not currently available', 403);
    }

    const priceDetails = getPriceMappingDetails(priceId);
    logger.info('Creating checkout session for:', {
      userId,
      priceId,
      plan: priceDetails?.plan,
      description: priceDetails?.description,
    });

    const customerId = await withStripeRetry(
      'ensureStripeCustomer',
      async () => {
        const result = await ensureStripeCustomer();
        if (!result.success || !result.customerId) {
          throw new Error(result.error ?? 'Failed to create customer');
        }
        return result.customerId;
      }
    );

    const selectedPlan = priceDetails?.plan;
    if (selectedPlan) {
      const subscriptionCheck = await withStripeRetry(
        'checkExistingPlanSubscription',
        () => checkExistingPlanSubscription(customerId, selectedPlan)
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

    const idempotencyKey = `checkout:${userId}:${priceId}:${checkoutSource ?? 'default'}:${idempotencyBucket}`;

    const session = await withStripeRetry('createCheckoutSession', () =>
      createCheckoutSession({
        customerId,
        priceId,
        userId,
        successUrl:
          checkoutSource === 'onboarding'
            ? `${baseUrl}${onboardingReturnTo}&upgrade=success${selectedPlan ? `&plan_id=${encodeURIComponent(selectedPlan)}` : ''}`
            : `${baseUrl}/billing/success${selectedPlan ? `?plan_id=${encodeURIComponent(selectedPlan)}` : ''}`,
        cancelUrl:
          checkoutSource === 'onboarding'
            ? `${baseUrl}${onboardingReturnTo}&upgrade=cancel`
            : `${baseUrl}/billing/cancel`,
        idempotencyKey,
        referralCode,
      })
    );

    logger.info('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId,
      customerId,
      url: session.url,
    });

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    return handleCheckoutError(error);
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

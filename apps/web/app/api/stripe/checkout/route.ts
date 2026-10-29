/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { agentCheckoutCorrelation } from '@/lib/acquisition/agent-checkout-correlation';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import {
  FIRST_TOUCH_COOKIE,
  openFirstTouchEnvelope,
} from '@/lib/acquisition/first-touch-envelope';
import { getCachedAuth } from '@/lib/auth/cached';
import { resolveCheckoutPriceForUser } from '@/lib/billing/price-lock.server';
import {
  CLAIM_FLOW_COOKIE,
  claimStateHref,
} from '@/lib/claim/artist-offer-claim';
import { publicEnv } from '@/lib/env-public';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { normalizeOnboardingReturnTo } from '@/lib/onboarding/return-to';
import {
  MAX_REFERRAL_CODE_LENGTH,
  MIN_REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_PATTERN,
} from '@/lib/referrals/config';
import { trackServerEvent } from '@/lib/server-analytics';
import {
  CheckoutCorrelationValidationError,
  hasCheckoutCorrelation,
  mergeCheckoutCorrelation,
  parseCheckoutCorrelation,
} from '@/lib/stripe/checkout-correlation';
import { checkoutCorrelationIdempotencyPart } from '@/lib/stripe/checkout-correlation.server';
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
import { ACQUISITION_COOKIE_NAME } from '@/lib/tracking/consent';
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

async function validatePriceId(
  priceId: string,
  userId: string
): Promise<NextResponse | null> {
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
    captureRevenueSpineFailure({
      stage: 'checkout',
      failureCode: 'configuration_missing',
      severity: 'blocked',
      userId,
    });
    await captureCriticalError(
      'Checkout rejected: no active price IDs configured',
      new Error(
        'getActivePriceIds() returned empty — STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY missing'
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
  let affectedUserId: string | null = null;
  try {
    const { userId } = await getCachedAuth({ session: 'fresh' });
    if (!userId) return jsonError('Unauthorized', 401);
    affectedUserId = userId;

    const parsedBody = await parseJsonBody<{
      humanConfirmed?: unknown;
      priceId?: unknown;
      referralCode?: unknown;
      returnTo?: unknown;
      source?: unknown;
      claimId?: unknown;
      claim_id?: unknown;
      runId?: unknown;
      run_id?: unknown;
      candidateId?: unknown;
      candidate_id?: unknown;
      offerVersion?: unknown;
      offer_version?: unknown;
      firstTouch?: unknown;
      first_touch?: unknown;
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

    const envelope = await openFirstTouchEnvelope(
      request.cookies.get(FIRST_TOUCH_COOKIE)?.value
    );
    if (envelope?.agentIntent && parsedBody.data.humanConfirmed !== true) {
      return jsonError('Confirm the purchase before starting checkout', 400);
    }
    let correlation;
    try {
      correlation = mergeCheckoutCorrelation(
        agentCheckoutCorrelation(envelope),
        parseCheckoutCorrelation(parsedBody.data),
        parseCheckoutCorrelation({
          acquisitionId: request.cookies.get(ACQUISITION_COOKIE_NAME)?.value,
        })
      );
    } catch (error) {
      if (error instanceof CheckoutCorrelationValidationError) {
        return jsonError(error.message, 400);
      }
      throw error;
    }
    const checkoutSource =
      rawSource === 'onboarding' || rawSource === 'youtube_thumbnails'
        ? rawSource
        : undefined;

    if (!priceId || typeof priceId !== 'string') {
      return jsonError('Invalid price ID', 400);
    }

    const referralCode = normalizeReferralCode(rawReferralCode);
    const onboardingReturnTo = normalizeOnboardingReturnTo(rawReturnTo);

    // Price lock: the person is charged the price they signed up at, not the
    // list price the browser sent. A lock that cannot be read or created
    // fails closed (500) rather than charging an unlocked price.
    const { decision: priceDecision, lock: priceLock } =
      await resolveCheckoutPriceForUser(userId, priceId);
    const chargedPriceId = priceDecision.priceId;
    const lockedExpectation =
      priceDecision.kind === 'locked' ? priceDecision.expectation : undefined;
    if (priceDecision.kind === 'locked' && priceDecision.substituted) {
      logger.info('Checkout price replaced by price lock', {
        userId,
        requestedPriceId: priceId,
        chargedPriceId,
        priceVersionId: priceLock.priceVersionId,
      });
    }

    if (priceDecision.kind === 'list') {
      const priceError = await validatePriceId(chargedPriceId, userId);
      if (priceError) return priceError;
    }

    if (!isMaxPlanEnabled() && isMaxPriceId(chargedPriceId)) {
      return jsonError('Max plan is not currently available', 403);
    }

    const priceDetails = getPriceMappingDetails(chargedPriceId);
    const resolvedPlan =
      priceDetails?.plan ??
      (priceDecision.kind === 'locked' ? priceDecision.plan : undefined);
    if (envelope?.agentIntent && resolvedPlan !== 'pro') {
      return jsonError('Invalid price for the selected offer', 400);
    }
    logger.info('Creating checkout session for:', {
      userId,
      priceId: chargedPriceId,
      plan: resolvedPlan,
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

    const selectedPlan = resolvedPlan;
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
            planChangeRequired: subscriptionCheck.planChangeRequired,
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    }

    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));

    // Self-serve claim (/claim/start) returns to the billing success state,
    // which confirms payment and entitlement, and to /claim on cancel.
    const isClaimFlow =
      checkoutSource === 'onboarding' &&
      request.cookies.get(CLAIM_FLOW_COOKIE)?.value === '1';

    const sourceKey = isClaimFlow ? 'claim' : (checkoutSource ?? 'default');
    const correlationPart = checkoutCorrelationIdempotencyPart(correlation);
    const idempotencyKey = correlationPart
      ? `checkout:${userId}:${chargedPriceId}:${sourceKey}:${correlationPart}:${idempotencyBucket}`
      : `checkout:${userId}:${chargedPriceId}:${sourceKey}:${idempotencyBucket}`;

    const planIdSuffix = selectedPlan
      ? `&plan_id=${encodeURIComponent(selectedPlan)}`
      : '';

    let successUrl: string;
    let cancelUrl: string;
    if (isClaimFlow) {
      successUrl = `${baseUrl}${APP_ROUTES.BILLING_SUCCESS}?session_id={CHECKOUT_SESSION_ID}${planIdSuffix}`;
      cancelUrl = `${baseUrl}${claimStateHref('checkout_canceled')}`;
    } else if (checkoutSource === 'onboarding') {
      successUrl = `${baseUrl}${onboardingReturnTo}&upgrade=success&session_id={CHECKOUT_SESSION_ID}${planIdSuffix}`;
      cancelUrl = `${baseUrl}${onboardingReturnTo}&upgrade=cancel`;
    } else if (checkoutSource === 'youtube_thumbnails') {
      successUrl = `${baseUrl}/billing/youtube-thumbnails/success?session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${baseUrl}/billing/youtube-thumbnails?checkout=cancel`;
    } else {
      successUrl = `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}${planIdSuffix}`;
      cancelUrl = `${baseUrl}/billing/cancel`;
    }

    const session = await withStripeRetry('createCheckoutSession', () =>
      createCheckoutSession({
        customerId,
        priceId: chargedPriceId,
        plan: selectedPlan,
        ...(lockedExpectation ? { lockedPrice: lockedExpectation } : {}),
        userId,
        successUrl,
        cancelUrl,
        idempotencyKey,
        referralCode,
        ...(hasCheckoutCorrelation(correlation) ? { correlation } : {}),
      })
    );

    logger.info('Checkout session created:', {
      sessionId: session.id,
      userId,
      priceId: chargedPriceId,
      customerId,
      url: session.url,
    });

    // Durable funnel event: checkout start is revenue-critical and must not
    // depend on client gtag delivery. Identity keyed to the Stripe session
    // makes it idempotent across refreshes and retries. A sink failure is
    // captured to Sentry inside trackServerEvent and never blocks checkout.
    await trackServerEvent(
      'checkout_initiated',
      {
        checkoutSessionId: session.id,
        plan: selectedPlan,
        source: checkoutSource ?? 'default',
      },
      undefined,
      { eventIdentity: `checkout:${session.id}` }
    );
    await recordArtistOfferStage(correlation.acquisitionId, 'checkout');

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureRevenueSpineFailure({
      stage: 'checkout',
      severity: 'blocked',
      userId: affectedUserId,
      error,
    });
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

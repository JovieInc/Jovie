/**
 * Billing Status API
 * Returns the current user's billing information
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { getRedis } from '@/lib/redis';
import { stripe } from '@/lib/stripe/client';
import { getPlanFromPriceId } from '@/lib/stripe/config';
import {
  getUserBillingInfo,
  updateUserBillingStatus,
} from '@/lib/stripe/customer-sync';
import { isActiveSubscription } from '@/lib/stripe/webhooks/utils';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

// Cache billing status briefly to reduce Stripe API calls while maintaining freshness
// private: Only browser can cache (not CDNs), max-age: 60s, stale-while-revalidate: 5 min
const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

// No caching for error responses
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const BILLING_STATUS_CACHE_KEY_PREFIX = 'billing:status:v1:';
const BILLING_STATUS_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

interface BillingStatusPayload {
  isPro: boolean;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface BillingStatusStalePayload extends BillingStatusPayload {
  _stale: true;
  _staleReason: string;
}

interface BillingStatusCacheEntry {
  payload: BillingStatusPayload;
  cachedAt: string;
}

interface HealStripeBillingMismatchParams {
  userId: string;
  stripeCustomerId: string;
}

function getBillingStatusCacheKey(userId: string): string {
  return `${BILLING_STATUS_CACHE_KEY_PREFIX}${userId}`;
}

function buildBillingStatusPayload(params: {
  isPro: boolean;
  plan: string | null | undefined;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): BillingStatusPayload {
  return {
    isPro: params.isPro,
    plan: params.plan ?? 'free',
    stripeCustomerId: params.stripeCustomerId,
    stripeSubscriptionId: params.stripeSubscriptionId,
  };
}

async function readCachedBillingStatus(
  userId: string
): Promise<BillingStatusCacheEntry | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<BillingStatusCacheEntry>(
      getBillingStatusCacheKey(userId)
    );
    if (!cached) return null;

    const entry =
      typeof cached === 'string'
        ? (JSON.parse(cached) as BillingStatusCacheEntry)
        : cached;

    if (!entry?.payload) return null;

    return entry;
  } catch (error) {
    logger.warn('Billing status cache read failed', {
      userId,
      error,
    });
    return null;
  }
}

function writeBillingStatusCache(
  userId: string,
  payload: BillingStatusPayload
): void {
  const redis = getRedis();
  if (!redis) return;

  const entry: BillingStatusCacheEntry = {
    payload,
    cachedAt: new Date().toISOString(),
  };

  redis
    .set(getBillingStatusCacheKey(userId), JSON.stringify(entry), {
      ex: BILLING_STATUS_CACHE_TTL_SECONDS,
    })
    .catch(error => {
      logger.warn('Billing status cache write failed', {
        userId,
        error,
      });
    });
}

function buildStaleBillingStatusPayload(
  payload: BillingStatusPayload
): BillingStatusStalePayload {
  return {
    ...payload,
    _stale: true,
    _staleReason: 'Payment service temporarily unavailable',
  };
}

async function healStripeBillingMismatch(
  params: HealStripeBillingMismatchParams
) {
  const { userId, stripeCustomerId } = params;

  try {
    // Limit to 5 subscriptions to control Stripe API cost — a customer with
    // more than 5 would be exceptional and can be investigated manually.
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 5,
    });

    const activeSubscription = subscriptions.data.find(subscription =>
      isActiveSubscription(subscription.status)
    );

    if (!activeSubscription) {
      return null;
    }

    const activePriceId = activeSubscription.items.data[0]?.price?.id;
    const recoveredPlan = activePriceId
      ? getPlanFromPriceId(activePriceId)
      : null;

    // If we can't determine the plan from the price ID, skip recovery to avoid
    // an inconsistent state (isPro: true with plan: 'free').
    if (!recoveredPlan) {
      logger.warn('Skipping billing recovery: unmapped or missing price ID', {
        userId,
        activePriceId: activePriceId ?? null,
      });
      return null;
    }

    const updateResult = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: true,
      plan: recoveredPlan,
      stripeCustomerId,
      stripeSubscriptionId: activeSubscription.id,
      eventType: 'reconciliation_fix',
      source: 'manual',
      metadata: {
        trigger: 'billing_status_read_recovery',
      },
    });

    if (!updateResult.success || updateResult.skipped) {
      logger.warn('Billing mismatch recovery skipped or failed', {
        userId,
        skipped: updateResult.skipped ?? false,
        reason: updateResult.reason,
        error: updateResult.error,
      });
      return null;
    }

    logger.info('Recovered billing mismatch from Stripe on status read', {
      userId,
      plan: recoveredPlan,
      subscriptionStatus: activeSubscription.status,
    });

    return {
      isPro: true,
      plan: recoveredPlan,
      stripeCustomerId,
      stripeSubscriptionId: activeSubscription.id,
    };
  } catch (error) {
    logger.warn('Billing mismatch recovery failed during status read', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

export async function GET() {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Get user's billing information
    const billingResult = await getUserBillingInfo();
    if (!billingResult.success) {
      const cached = await readCachedBillingStatus(userId);
      if (cached) {
        return NextResponse.json(
          buildStaleBillingStatusPayload(cached.payload),
          { headers: CACHE_HEADERS }
        );
      }

      // Billing lookup failed — surface as 503 so clients can distinguish
      // "free user" from "billing system unavailable" and show a retry state
      // instead of silently revoking pro features.
      logger.warn('Billing lookup failed for user (transient):', {
        userId,
        error: billingResult.error,
      });
      // Note: Not reporting to Sentry here — transient billing failures are
      // already captured upstream in fetchUserBillingData. Reporting again here
      // creates duplicate noise (835+ events). The 503 response lets clients
      // retry gracefully.
      return NextResponse.json(
        { error: 'Billing service temporarily unavailable' },
        {
          status: 503,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SERVICE },
        }
      );
    }

    if (!billingResult.data) {
      // User exists in auth but not in database — likely needs onboarding
      const payload = buildBillingStatusPayload({
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
      writeBillingStatusCache(userId, payload);
      return NextResponse.json(payload, { headers: CACHE_HEADERS });
    }

    const { isPro, stripeCustomerId, stripeSubscriptionId, plan } =
      billingResult.data;

    let payload = buildBillingStatusPayload({
      isPro,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
    });

    if (!isPro && stripeCustomerId) {
      const recoveredBilling = await healStripeBillingMismatch({
        userId,
        stripeCustomerId,
      });

      if (recoveredBilling) {
        payload = buildBillingStatusPayload(recoveredBilling);
        writeBillingStatusCache(userId, payload);
        return NextResponse.json(payload, { headers: CACHE_HEADERS });
      }
    }

    writeBillingStatusCache(userId, payload);
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    logger.error('Error getting billing status:', error);

    await captureError('Billing status endpoint error', error, {
      route: '/api/billing/status',
    });

    return NextResponse.json(
      { error: 'Failed to get billing status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

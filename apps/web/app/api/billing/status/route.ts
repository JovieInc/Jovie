/**
 * Billing Status API
 * Returns the current user's billing information
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';
import { RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { getRedis } from '@/lib/redis';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
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
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialNotificationsSent: number;
}

async function readTrialFields(clerkId: string): Promise<{
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialNotificationsSent: number;
}> {
  try {
    const row = await db
      .select({
        trialStartedAt: users.trialStartedAt,
        trialEndsAt: users.trialEndsAt,
        trialNotificationsSent: users.trialNotificationsSent,
      })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    const record = row[0];
    if (!record) {
      return {
        trialStartedAt: null,
        trialEndsAt: null,
        trialNotificationsSent: 0,
      };
    }

    return {
      trialStartedAt: record.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: record.trialEndsAt?.toISOString() ?? null,
      trialNotificationsSent: record.trialNotificationsSent ?? 0,
    };
  } catch (error) {
    logger.warn('Trial field read failed; defaulting to nulls', {
      clerkId,
      error,
    });
    return {
      trialStartedAt: null,
      trialEndsAt: null,
      trialNotificationsSent: 0,
    };
  }
}

interface BillingStatusStalePayload extends BillingStatusPayload {
  _stale: true;
  _staleReason: string;
}

interface BillingStatusCacheEntry {
  payload: BillingStatusPayload;
  cachedAt: string;
}

function getBillingStatusCacheKey(userId: string): string {
  return `${BILLING_STATUS_CACHE_KEY_PREFIX}${userId}`;
}

function buildBillingStatusPayload(params: {
  isPro: boolean;
  plan: string | null | undefined;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialNotificationsSent: number;
}): BillingStatusPayload {
  return {
    isPro: params.isPro,
    plan: params.plan ?? 'free',
    stripeCustomerId: params.stripeCustomerId,
    stripeSubscriptionId: params.stripeSubscriptionId,
    trialStartedAt: params.trialStartedAt,
    trialEndsAt: params.trialEndsAt,
    trialNotificationsSent: params.trialNotificationsSent,
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

export async function GET() {
  try {
    // Check authentication
    const { userId } = await getCachedAuth();
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

    const trialFields = await readTrialFields(userId);

    if (!billingResult.data) {
      // User exists in auth but not in database — likely needs onboarding
      const payload = buildBillingStatusPayload({
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        ...trialFields,
      });
      writeBillingStatusCache(userId, payload);
      return NextResponse.json(payload, { headers: CACHE_HEADERS });
    }

    const { isPro, stripeCustomerId, stripeSubscriptionId, plan } =
      billingResult.data;

    const payload = buildBillingStatusPayload({
      isPro,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      ...trialFields,
    });

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

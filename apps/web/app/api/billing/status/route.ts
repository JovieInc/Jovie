/**
 * Billing Status API
 * Returns the current user's billing information
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { RETRY_AFTER_SERVICE } from '@/lib/http/headers';
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
      // Billing lookup failed — surface as 503 so clients can distinguish
      // "free user" from "billing system unavailable" and show a retry state
      // instead of silently revoking pro features.
      logger.error('Billing lookup failed for user:', {
        userId,
        error: billingResult.error,
      });
      await captureCriticalError(
        'Billing lookup failed — user may lose pro features',
        new Error(`Billing lookup failed: ${billingResult.error}`),
        {
          route: '/api/billing/status',
          userId,
        }
      );
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
      return NextResponse.json(
        {
          isPro: false,
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
        { headers: CACHE_HEADERS }
      );
    }

    const { isPro, stripeCustomerId, stripeSubscriptionId, plan } =
      billingResult.data;

    return NextResponse.json(
      {
        isPro,
        plan: plan ?? 'free',
        stripeCustomerId,
        stripeSubscriptionId,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting billing status:', error);

    await captureCriticalError(
      'Billing status endpoint error — revenue-critical',
      error,
      { route: '/api/billing/status' }
    );

    return NextResponse.json(
      { error: 'Failed to get billing status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Billing Status API
 * Returns the current user's billing information
 */

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
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
    if (!billingResult.success || !billingResult.data) {
      // User not found in database - they might need onboarding
      return NextResponse.json(
        {
          isPro: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
        { headers: CACHE_HEADERS }
      );
    }

    const { isPro, stripeCustomerId, stripeSubscriptionId } =
      billingResult.data;

    return NextResponse.json(
      {
        isPro,
        stripeCustomerId,
        stripeSubscriptionId,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting billing status:', error);

    // Capture billing errors in Sentry (revenue-critical)
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        route: '/api/billing/status',
        errorType: 'billing_error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to get billing status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

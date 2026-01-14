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
        { headers: NO_STORE_HEADERS }
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
      { headers: NO_STORE_HEADERS }
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

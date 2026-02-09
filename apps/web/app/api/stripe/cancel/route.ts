/**
 * Stripe Subscription Cancellation API
 * Cancels the user's subscription in-app with immediate effect.
 * The webhook handler (subscription.deleted) will revoke pro access.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { cancelSubscription } from '@/lib/stripe/client';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
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
      logger.error(
        'Failed to get user billing info for cancellation:',
        billingResult.error
      );
      return NextResponse.json(
        { error: 'Failed to retrieve billing information' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const { stripeSubscriptionId, isPro } = billingResult.data;

    // Verify user has an active subscription
    if (!isPro || !stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription to cancel' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Cancel the subscription via Stripe
    const cancelledSubscription =
      await cancelSubscription(stripeSubscriptionId);

    logger.info('Subscription cancelled in-app', {
      userId,
      subscriptionId: stripeSubscriptionId,
      status: cancelledSubscription.status,
    });

    return NextResponse.json(
      {
        success: true,
        status: cancelledSubscription.status,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error cancelling subscription:', error);

    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Only allow POST requests
export function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

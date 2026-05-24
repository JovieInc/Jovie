/**
 * Stripe Subscription Cancellation API
 *
 * Schedules cancellation at the end of the current billing period (industry
 * norm). The user keeps Pro access until `current_period_end`; Stripe fires
 * `customer.subscription.updated` immediately and
 * `customer.subscription.deleted` at the boundary when access is revoked.
 *
 * @see JOV-2180 — subset #1 (cancel period-end)
 */

import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureCriticalError } from '@/lib/error-tracking';
import { cancelSubscription } from '@/lib/stripe/client';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
  let userId: string | null = null;
  let subscriptionId: string | null = null;

  try {
    // Check authentication
    ({ userId } = await getCachedAuth());
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
    subscriptionId = stripeSubscriptionId;

    // Verify user has an active subscription
    if (!isPro || !stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription to cancel' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Schedule cancellation at end of current billing period
    const cancelledSubscription =
      await cancelSubscription(stripeSubscriptionId);

    // Stripe SDK types for `current_period_end` vary by API version; read it
    // defensively so we can surface the cancel-on date to the client.
    const rawPeriodEnd = Reflect.get(
      cancelledSubscription,
      'current_period_end'
    );
    const cancelAtSeconds =
      typeof cancelledSubscription.cancel_at === 'number'
        ? cancelledSubscription.cancel_at
        : typeof rawPeriodEnd === 'number'
          ? rawPeriodEnd
          : null;
    const cancelAtIso =
      cancelAtSeconds !== null
        ? new Date(cancelAtSeconds * 1000).toISOString()
        : null;

    logger.info('Subscription scheduled to cancel at period end', {
      userId,
      subscriptionId: stripeSubscriptionId,
      status: cancelledSubscription.status,
      cancelAtPeriodEnd: cancelledSubscription.cancel_at_period_end,
      cancelAt: cancelAtIso,
    });

    return NextResponse.json(
      {
        success: true,
        status: cancelledSubscription.status,
        cancelAtPeriodEnd: cancelledSubscription.cancel_at_period_end === true,
        cancelAt: cancelAtIso,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    void captureCriticalError(
      'Stripe subscription cancellation failed',
      error,
      {
        route: '/api/stripe/cancel',
        userId,
        subscriptionId,
      }
    );

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

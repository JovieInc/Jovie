/**
 * Plan Change API
 *
 * Handles subscription plan upgrades and downgrades.
 *
 * POST /api/stripe/plan-change
 *   - Execute a plan change (upgrade/downgrade)
 *   - Body: { priceId: string }
 *
 * GET /api/stripe/plan-change
 *   - Get available plan change options for the current user
 *
 * POST /api/stripe/plan-change/preview
 *   - Preview proration for a plan change
 *   - Body: { priceId: string }
 *
 * DELETE /api/stripe/plan-change
 *   - Cancel a scheduled plan change (downgrade)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';
import {
  cancelScheduledPlanChange,
  executePlanChange,
  getActiveSubscription,
  getAvailablePlanChanges,
} from '@/lib/stripe/plan-change';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Execute a plan change
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const { priceId } = body;

    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Ensure customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: 'Failed to find customer' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Get current subscription
    const subscription = await getActiveSubscription(customerResult.customerId);
    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription. Use checkout to subscribe.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('Processing plan change request', {
      userId,
      subscriptionId: subscription.id,
      newPriceId: priceId,
    });

    // Execute the plan change
    const result = await executePlanChange({
      subscriptionId: subscription.id,
      newPriceId: priceId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to change plan' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('Plan change completed', {
      userId,
      isScheduledChange: result.isScheduledChange,
      effectiveDate: result.effectiveDate.toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        isScheduledChange: result.isScheduledChange,
        effectiveDate: result.effectiveDate.toISOString(),
        message: result.isScheduledChange
          ? `Your plan will change on ${result.effectiveDate.toLocaleDateString()}`
          : 'Your plan has been updated',
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error processing plan change', error);
    await captureCriticalError('Stripe plan change failed', error, {
      route: '/api/stripe/plan-change',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to process plan change' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Get available plan change options
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Ensure customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      // No customer yet - return free plan options
      const availableChanges = await getAvailablePlanChanges('');
      return NextResponse.json(
        {
          currentPlan: 'free',
          currentPriceId: null,
          currentInterval: null,
          availableChanges: availableChanges?.availableChanges || [],
          hasActiveSubscription: false,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Fetch plan options and subscription in parallel (independent calls)
    const [planOptions, subscription] = await Promise.all([
      getAvailablePlanChanges(customerResult.customerId),
      getActiveSubscription(customerResult.customerId),
    ]);

    if (!planOptions) {
      return NextResponse.json(
        { error: 'Failed to get plan options' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const hasScheduledChange = !!subscription?.schedule;

    return NextResponse.json(
      {
        ...planOptions,
        hasActiveSubscription: !!subscription,
        hasScheduledChange,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting plan options', error);
    await captureCriticalError('Failed to get plan change options', error, {
      route: '/api/stripe/plan-change',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to get plan options' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Cancel a scheduled plan change
 */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Ensure customer exists
    const customerResult = await ensureStripeCustomer();
    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: 'Failed to find customer' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Get current subscription
    const subscription = await getActiveSubscription(customerResult.customerId);
    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await cancelScheduledPlanChange(subscription.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to cancel scheduled change' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('Cancelled scheduled plan change', { userId });

    return NextResponse.json(
      {
        success: true,
        message: 'Scheduled plan change cancelled',
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error cancelling scheduled plan change', error);
    await captureCriticalError('Failed to cancel scheduled plan change', error, {
      route: '/api/stripe/plan-change',
      method: 'DELETE',
    });
    return NextResponse.json(
      { error: 'Failed to cancel scheduled change' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import 'server-only';

import type Stripe from 'stripe';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { isActiveSubscription } from '@/lib/stripe/webhooks/utils';

export interface AdminStripeOverviewMetrics {
  mrrUsd: number;
  activeSubscribers: number;
  mrrUsd30dAgo: number;
  mrrGrowth30dUsd: number;
  /** Indicates whether Stripe credentials are configured */
  isConfigured: boolean;
  /** Indicates whether the Stripe API call succeeded */
  isAvailable: boolean;
  /** Error message if Stripe API call failed */
  errorMessage?: string;
}

function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

function computeMonthlyCentsFromPriceItem(
  item: Stripe.SubscriptionItem
): number {
  const price = item.price;
  if (!price) return 0;
  if (price.currency !== 'usd') return 0;
  if (typeof price.unit_amount !== 'number') return 0;

  const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
  const amountCents = price.unit_amount * quantity;

  const interval = price.recurring?.interval;
  const intervalCount =
    typeof price.recurring?.interval_count === 'number'
      ? price.recurring.interval_count
      : 1;

  if (interval === 'month') {
    const months = Math.max(1, intervalCount);
    return Math.round(amountCents / months);
  }

  if (interval === 'year') {
    const months = Math.max(1, intervalCount) * 12;
    return Math.round(amountCents / months);
  }

  return 0;
}

/**
 * Extract the first expanded coupon from a subscription's discounts array.
 * Stripe returns `discounts` as `Array<string | Stripe.Discount>`.
 * Only expanded Discount objects (with a nested coupon object) are usable.
 */
function getFirstCoupon(sub: Stripe.Subscription): Stripe.Coupon | null {
  if (!Array.isArray(sub.discounts) || sub.discounts.length === 0) return null;

  for (const entry of sub.discounts) {
    // Skip unexpanded string IDs
    if (typeof entry === 'string') continue;
    // entry is Stripe.Discount — coupon lives at source.coupon
    const coupon = entry.source?.coupon;
    if (coupon && typeof coupon === 'object') {
      return coupon;
    }
  }
  return null;
}

/**
 * Compute the discount multiplier for a subscription based on its coupon.
 * Returns a value between 0 and 1 (e.g. 0.8 for a 20% discount).
 * If no discount applies, returns 1.
 */
function getDiscountMultiplier(sub: Stripe.Subscription): number {
  const coupon = getFirstCoupon(sub);
  if (!coupon) return 1;

  // Percentage-based coupon (e.g. 20% off -> multiplier 0.8)
  if (typeof coupon.percent_off === 'number' && coupon.percent_off > 0) {
    return Math.max(0, 1 - coupon.percent_off / 100);
  }

  // Fixed-amount coupon is handled separately via getFixedDiscountCentsPerMonth
  return 1;
}

/**
 * Compute the fixed discount amount in cents/month for a subscription.
 * For amount_off coupons, the fixed amount is subtracted from the gross MRR.
 */
function getFixedDiscountCentsPerMonth(sub: Stripe.Subscription): number {
  const coupon = getFirstCoupon(sub);
  if (!coupon) return 0;

  if (typeof coupon.amount_off !== 'number' || coupon.amount_off <= 0) {
    return 0;
  }

  // Only apply if the coupon currency matches USD
  if (coupon.currency && coupon.currency !== 'usd') return 0;

  // The fixed discount is applied per billing cycle. Since we already
  // normalize prices to monthly, we return the amount as-is (Stripe
  // applies amount_off once per billing period, and our MRR is monthly).
  return coupon.amount_off;
}

function isSubscriptionActiveAt(
  subscription: Stripe.Subscription,
  timestampSeconds: number
): boolean {
  if (
    subscription.status === 'incomplete' ||
    subscription.status === 'incomplete_expired'
  ) {
    return false;
  }

  if (subscription.created > timestampSeconds) {
    return false;
  }

  const endTimestamp =
    subscription.ended_at ??
    subscription.canceled_at ??
    subscription.cancel_at ??
    null;

  if (endTimestamp != null && endTimestamp <= timestampSeconds) {
    return false;
  }

  return true;
}

// Result type for accumulating subscription metrics
interface SubscriptionMetricsAccumulator {
  mrrCents: number;
  activeSubscribers: number;
  pastMrrCents: number;
}

// Process a single subscription and accumulate metrics.
// MRR reflects net revenue after coupons/discounts (JOV-1089).
function processSubscription(
  sub: Stripe.Subscription,
  thirtyDaysAgoSeconds: number,
  accumulator: SubscriptionMetricsAccumulator
): void {
  if (!isActiveSubscription(sub.status)) return;
  if (!Array.isArray(sub.items.data) || sub.items.data.length === 0) return;

  accumulator.activeSubscribers += 1;

  // Sum gross MRR across all line items
  let grossMrrCents = 0;
  for (const item of sub.items.data) {
    grossMrrCents += computeMonthlyCentsFromPriceItem(item);
  }

  // Apply discount: percentage coupons scale the total, fixed coupons subtract
  const discountMultiplier = getDiscountMultiplier(sub);
  const fixedDiscountCents = getFixedDiscountCentsPerMonth(sub);
  const netMrrCents = Math.max(
    0,
    Math.round(grossMrrCents * discountMultiplier) - fixedDiscountCents
  );

  accumulator.mrrCents += netMrrCents;
  if (isSubscriptionActiveAt(sub, thirtyDaysAgoSeconds)) {
    accumulator.pastMrrCents += netMrrCents;
  }
}

// Build the success response from accumulated metrics
function buildSuccessResponse(
  accumulator: SubscriptionMetricsAccumulator
): AdminStripeOverviewMetrics {
  return {
    mrrUsd: accumulator.mrrCents / 100,
    activeSubscribers: accumulator.activeSubscribers,
    mrrUsd30dAgo: accumulator.pastMrrCents / 100,
    mrrGrowth30dUsd: (accumulator.mrrCents - accumulator.pastMrrCents) / 100,
    isConfigured: true,
    isAvailable: true,
  };
}

// Build error response for unconfigured state
function buildUnconfiguredResponse(): AdminStripeOverviewMetrics {
  return {
    mrrUsd: 0,
    activeSubscribers: 0,
    mrrUsd30dAgo: 0,
    mrrGrowth30dUsd: 0,
    isConfigured: false,
    isAvailable: false,
    errorMessage:
      'Stripe credentials not configured (STRIPE_SECRET_KEY required)',
  };
}

// Build error response for API failure
function buildErrorResponse(message: string): AdminStripeOverviewMetrics {
  return {
    mrrUsd: 0,
    activeSubscribers: 0,
    mrrUsd30dAgo: 0,
    mrrGrowth30dUsd: 0,
    isConfigured: true,
    isAvailable: false,
    errorMessage: `Stripe API error: ${message}`,
  };
}

export async function getAdminStripeOverviewMetrics(): Promise<AdminStripeOverviewMetrics> {
  if (!isStripeConfigured()) {
    return buildUnconfiguredResponse();
  }

  try {
    const accumulator: SubscriptionMetricsAccumulator = {
      mrrCents: 0,
      activeSubscribers: 0,
      pastMrrCents: 0,
    };
    let startingAfter: string | undefined;
    const thirtyDaysAgoSeconds = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );

    for (;;) {
      const page = await stripe.subscriptions.list({
        status: 'all',
        expand: ['data.items.data.price'],
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of page.data) {
        processSubscription(sub, thirtyDaysAgoSeconds, accumulator);
      }

      if (!page.has_more || page.data.length === 0) break;

      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return buildSuccessResponse(accumulator);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    captureError('Error loading Stripe metrics', error, { message });
    return buildErrorResponse(message);
  }
}

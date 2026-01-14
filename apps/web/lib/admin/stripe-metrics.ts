import 'server-only';

import type Stripe from 'stripe';
import { env } from '@/lib/env-server';
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

export async function getAdminStripeOverviewMetrics(): Promise<AdminStripeOverviewMetrics> {
  if (!isStripeConfigured()) {
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

  try {
    let mrrCents = 0;
    let activeSubscribers = 0;
    let pastMrrCents = 0;
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
        if (!isActiveSubscription(sub.status)) continue;
        if (!Array.isArray(sub.items.data) || sub.items.data.length === 0)
          continue;

        activeSubscribers += 1;

        for (const item of sub.items.data) {
          const itemMrrCents = computeMonthlyCentsFromPriceItem(item);
          // Subscription is active (verified by isActiveSubscription check above)
          mrrCents += itemMrrCents;
          if (isSubscriptionActiveAt(sub, thirtyDaysAgoSeconds)) {
            pastMrrCents += itemMrrCents;
          }
        }
      }

      if (!page.has_more || page.data.length === 0) {
        break;
      }

      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return {
      mrrUsd: mrrCents / 100,
      activeSubscribers,
      mrrUsd30dAgo: pastMrrCents / 100,
      mrrGrowth30dUsd: (mrrCents - pastMrrCents) / 100,
      isConfigured: true,
      isAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error loading Stripe metrics:', error);
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
}

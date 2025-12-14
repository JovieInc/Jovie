import 'server-only';

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';

export interface AdminStripeOverviewMetrics {
  mrrUsd: number;
  activeSubscribers: number;
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

  if (interval === 'month') {
    return amountCents;
  }

  if (interval === 'year') {
    return Math.round(amountCents / 12);
  }

  return 0;
}

export async function getAdminStripeOverviewMetrics(): Promise<AdminStripeOverviewMetrics> {
  let mrrCents = 0;
  let activeSubscribers = 0;
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      expand: ['data.items.price'],
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const sub of page.data) {
      if (!Array.isArray(sub.items.data) || sub.items.data.length === 0)
        continue;

      activeSubscribers += 1;

      for (const item of sub.items.data) {
        mrrCents += computeMonthlyCentsFromPriceItem(item);
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
  };
}

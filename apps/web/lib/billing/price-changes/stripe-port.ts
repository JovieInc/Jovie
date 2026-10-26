import 'server-only';

import type Stripe from 'stripe';
import { env } from '@/lib/env-server';
import { stripe } from '@/lib/stripe/client';
import {
  type AffectedSubscription,
  ScheduleOwnedError,
  type StripePort,
} from './ports';
import type { ScheduledPriceChange } from './types';

/**
 * Statuses that can still bill later. `paused`, `unpaid` and `incomplete` come
 * back to life, so they are notified too (Opus review, 2026-10-26).
 */
const NOTIFIABLE_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'paused',
  'unpaid',
  'incomplete',
]);

function priceIdFromEnv(key: string): string {
  const value = (process.env as Record<string, string | undefined>)[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

/** Real apply requires an explicit second switch when the key is live-mode. */
export function assertApplyAllowed(): void {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (
    key.startsWith('sk_live_') &&
    process.env.PRICE_CHANGE_APPLY_LIVE !== 'true'
  ) {
    throw new Error(
      'refusing to switch live subscriptions: PRICE_CHANGE_APPLY_LIVE is not "true"'
    );
  }
}

/** The record's old amount/interval must be what subscribers really pay. */
async function assertOldPriceContract(
  change: ScheduledPriceChange,
  priceId: string
): Promise<void> {
  const price = await stripe.prices.retrieve(priceId);
  if (
    price.currency !== change.currency ||
    price.unit_amount !== change.oldAmountCents ||
    price.recurring?.interval !== change.interval ||
    price.recurring.interval_count !== 1
  ) {
    throw new Error(
      `Stripe price ${priceId} does not match the old price of scheduled change ${change.id}`
    );
  }
}

async function assertNewPriceContract(
  change: ScheduledPriceChange,
  priceId: string
): Promise<void> {
  const price = await stripe.prices.retrieve(priceId);
  if (
    !price.active ||
    price.currency !== change.currency ||
    price.unit_amount !== change.newAmountCents ||
    price.type !== 'recurring' ||
    price.billing_scheme !== 'per_unit' ||
    price.recurring?.interval !== change.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== 'licensed' ||
    price.transform_quantity !== null
  ) {
    throw new Error(
      `Stripe price ${priceId} does not match scheduled change ${change.id}`
    );
  }
}

export const stripePriceChangePort: StripePort = {
  async listAffected(change) {
    const oldPriceId = priceIdFromEnv(change.oldStripePriceEnvKey);
    await assertOldPriceContract(change, oldPriceId);
    const found: AffectedSubscription[] = [];
    for await (const subscription of stripe.subscriptions.list({
      price: oldPriceId,
      status: 'all',
      limit: 100,
      expand: ['data.customer'],
    })) {
      if (!NOTIFIABLE_STATUSES.has(subscription.status)) continue;
      const item = subscription.items.data.find(
        candidate => candidate.price.id === oldPriceId
      );
      if (!item) continue;
      const customer = subscription.customer;
      const customerId = typeof customer === 'string' ? customer : customer.id;
      const customerEmail =
        typeof customer === 'string' || customer.deleted
          ? null
          : customer.email;
      found.push({
        subscriptionId: subscription.id,
        customerId,
        customerEmail: customerEmail ?? null,
        status: subscription.status,
        itemId: item.id,
        hasSchedule: Boolean(subscription.schedule),
      });
    }
    return found;
  },

  async switchPrice(change, subscription, idempotencyKey) {
    assertApplyAllowed();
    if (subscription.hasSchedule) {
      throw new ScheduleOwnedError(subscription.subscriptionId);
    }
    const newPriceId = priceIdFromEnv(change.newStripePriceEnvKey);
    await assertOldPriceContract(
      change,
      priceIdFromEnv(change.oldStripePriceEnvKey)
    );
    await assertNewPriceContract(change, newPriceId);
    // Update only the item on the old price, by id; other items are untouched.
    // No proration: the new price first bills at the next renewal.
    await stripe.subscriptions.update(
      subscription.subscriptionId,
      {
        items: [{ id: subscription.itemId, price: newPriceId }],
        proration_behavior: 'none',
        metadata: { price_change_id: change.id },
      },
      { idempotencyKey }
    );
    return { stripePriceId: newPriceId };
  },
};

import 'server-only';
import type Stripe from 'stripe';
import type { LockedCheckoutExpectation } from '@/lib/billing/price-lock-checkout';
import { ACTIVE_PRICE_MAPPINGS } from './config';

/** Stripe's billable object must match the displayed offer before any mutation. */
export async function assertCheckoutPriceContract(
  priceId: string,
  retrievePrice: (id: string) => Promise<Stripe.Price>,
  /**
   * A person's price lock (lib/billing/price-lock-checkout.ts). A locked price
   * may be retired from the active list, so the expectation is the lock's own
   * snapshot instead of the active mapping. Stripe must still agree with it.
   */
  locked?: LockedCheckoutExpectation
): Promise<void> {
  const expected = locked
    ? {
        currency: locked.currency,
        amount: locked.amountCents,
        interval: locked.interval,
      }
    : ACTIVE_PRICE_MAPPINGS[priceId];
  if (!expected)
    throw new Error('This price is not available for new subscriptions');
  const actual = await retrievePrice(priceId);
  if (
    !actual.active ||
    actual.id !== priceId ||
    actual.currency !== expected.currency ||
    actual.unit_amount !== expected.amount ||
    actual.type !== 'recurring' ||
    actual.billing_scheme !== 'per_unit' ||
    actual.recurring?.interval !== expected.interval ||
    actual.recurring.interval_count !== 1 ||
    actual.recurring.usage_type !== 'licensed' ||
    actual.transform_quantity !== null
  ) {
    throw new Error('Billing price does not match the published offer');
  }
}

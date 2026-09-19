import 'server-only';
import type Stripe from 'stripe';
import { ACTIVE_PRICE_MAPPINGS } from './config';

/** Stripe's billable object must match the displayed offer before any mutation. */
export async function assertCheckoutPriceContract(
  priceId: string,
  retrievePrice: (id: string) => Promise<Stripe.Price>
): Promise<void> {
  const expected = ACTIVE_PRICE_MAPPINGS[priceId];
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

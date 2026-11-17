import 'server-only';
import type Stripe from 'stripe';
import type { LockedCheckoutExpectation } from '@/lib/billing/price-lock-checkout';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { ACTIVE_PRICE_MAPPINGS, getPriceMappingDetails } from './config';

/** Trusted lock metadata, used only after assertCheckoutPriceContract succeeds. */
export function getPlanDetails(
  priceId: string,
  lockedPrice?: LockedCheckoutExpectation
) {
  const mapped = getPriceMappingDetails(priceId);
  if (mapped || !lockedPrice) return mapped;
  return {
    plan: 'pro' as const,
    interval: lockedPrice.interval,
    description: getPlanDisplayName('pro'),
  };
}

/** Stripe's billable object must match the displayed offer before any mutation. */
export async function assertCheckoutPriceContract(
  priceId: string,
  retrievePrice: (id: string) => Promise<Stripe.Price>,
  /** A price lock's snapshot; Stripe must agree even if the price is retired. */
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

/** JOV-INV-048 consumer: checkout and plan-change price resolution. */
import {
  type PriceInterval,
  type PriceLockSnapshot,
  resolveLockedPrice,
} from './price-versions';
export interface CheckoutPriceMapping {
  readonly plan: string;
  readonly interval: PriceInterval;
}
export interface LockedCheckoutExpectation {
  readonly amountCents: number;
  readonly currency: string;
  readonly interval: PriceInterval;
}
export type CheckoutPriceDecision =
  | { readonly kind: 'list'; readonly priceId: string }
  | {
      readonly kind: 'locked';
      readonly priceId: string;
      readonly plan: PriceLockSnapshot['plan'];
      readonly expectation: LockedCheckoutExpectation;
      readonly substituted: boolean;
    };
function lockOwnsPriceId(lock: PriceLockSnapshot, priceId: string): boolean {
  return (
    priceId === lock.stripePriceIdMonthly ||
    priceId === lock.stripePriceIdYearly
  );
}
export function resolveCheckoutPrice(input: {
  readonly requestedPriceId: string;
  readonly requestedMapping: CheckoutPriceMapping | null;
  readonly lock: PriceLockSnapshot | null;
}): CheckoutPriceDecision {
  const { requestedPriceId, requestedMapping, lock } = input;
  if (!lock) return { kind: 'list', priceId: requestedPriceId };
  // The requested id is one of the lock's own ids (possibly retired/unmapped).
  const interval: PriceInterval | null = requestedMapping
    ? requestedMapping.plan === lock.plan
      ? requestedMapping.interval
      : null
    : requestedPriceId === lock.stripePriceIdMonthly
      ? 'month'
      : requestedPriceId === lock.stripePriceIdYearly
        ? 'year'
        : null;
  if (!interval) return { kind: 'list', priceId: requestedPriceId };
  const price = resolveLockedPrice({ lock, interval });
  if (!price?.locked || !price.stripePriceId) {
    // The lock does not cover this interval (or has no Stripe id for it): a
    // list id is charged at list price, an id the lock owns passes through.
    return { kind: 'list', priceId: requestedPriceId };
  }
  return {
    kind: 'locked',
    priceId: price.stripePriceId,
    plan: lock.plan,
    expectation: {
      amountCents: price.amountCents,
      currency: price.currency,
      interval,
    },
    substituted:
      price.stripePriceId !== requestedPriceId &&
      !lockOwnsPriceId(lock, requestedPriceId),
  };
}

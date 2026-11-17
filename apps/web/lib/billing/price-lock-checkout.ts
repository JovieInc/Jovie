/** JOV-INV-048 consumer: checkout and plan-change price resolution. */
import {
  type PriceInterval,
  type PriceLockSnapshot,
  resolveLockedPrice,
} from './price-versions';
export interface CheckoutPriceMapping {
  readonly plan: string;
  readonly interval: PriceInterval;
  readonly amount?: number;
  readonly legacy?: boolean;
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
  if (
    !lock ||
    (requestedMapping?.legacy && !lockOwnsPriceId(lock, requestedPriceId))
  ) {
    return { kind: 'list', priceId: requestedPriceId };
  }
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
  if (!price?.locked) return { kind: 'list', priceId: requestedPriceId };
  if (!price.stripePriceId) throw new Error('The locked price is unavailable');
  if (
    !lockOwnsPriceId(lock, requestedPriceId) &&
    requestedMapping?.amount !== undefined &&
    price.amountCents > requestedMapping.amount
  ) {
    throw new Error(
      'The locked price exceeds the requested offer; select the locked price explicitly'
    );
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

/** JOV-INV-048 consumer: checkout and plan-change price resolution. */
import {
  type PriceInterval,
  type PriceLockSnapshot,
  type ResolvedLockedPrice,
  resolveLockedPrice,
} from './price-versions';
export interface CheckoutPriceMapping {
  readonly plan: string;
  readonly interval: PriceInterval;
  readonly amount?: number;
  readonly legacy?: boolean;
}
export type LockedCheckoutExpectation = Pick<
  ResolvedLockedPrice,
  'amountCents' | 'currency' | 'interval'
>;
export type CheckoutPriceDecision =
  | { readonly kind: 'list'; readonly priceId: string }
  | {
      readonly kind: 'locked';
      readonly priceId: string;
      readonly plan: PriceLockSnapshot['plan'];
      readonly expectation: LockedCheckoutExpectation;
      readonly substituted: boolean;
    };
export function resolveCheckoutPrice(input: {
  readonly requestedPriceId: string;
  readonly requestedMapping: CheckoutPriceMapping | null;
  readonly lock: PriceLockSnapshot | null;
}): CheckoutPriceDecision {
  const { requestedPriceId, requestedMapping, lock } = input;
  const ownedInterval =
    requestedPriceId === lock?.stripePriceIdMonthly
      ? 'month'
      : requestedPriceId === lock?.stripePriceIdYearly
        ? 'year'
        : null;
  const ownsPrice = ownedInterval !== null;
  if (!lock || (requestedMapping?.legacy && !ownsPrice)) {
    return { kind: 'list', priceId: requestedPriceId };
  }
  // The requested id is one of the lock's own ids (possibly retired/unmapped).
  const interval: PriceInterval | null = requestedMapping
    ? requestedMapping.plan === lock.plan
      ? requestedMapping.interval
      : null
    : ownedInterval;
  if (!interval) return { kind: 'list', priceId: requestedPriceId };
  const price = resolveLockedPrice({ lock, interval });
  if (!price?.locked) return { kind: 'list', priceId: requestedPriceId };
  if (!price.stripePriceId) throw new Error('The locked price is unavailable');
  if (
    !ownsPrice &&
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
    substituted: price.stripePriceId !== requestedPriceId && !ownsPrice,
  };
}

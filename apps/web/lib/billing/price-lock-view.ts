/** Client-safe price lock view and helpers for client price surfaces. */

import type { PricingOption } from '@/lib/queries/usePricingOptionsQuery';
import type { LockedCheckoutExpectation } from './price-lock-checkout';
import {
  formatLockedPrice,
  type PriceInterval,
  type PriceLockSnapshot,
  priceLockDisclosure,
  resolveLockedPrice,
} from './price-versions';

export interface PriceLockViewPrice extends LockedCheckoutExpectation {
  readonly priceId: string | null;
}

export interface PriceLockView {
  readonly locked: true;
  readonly priceVersionId: string;
  readonly lockedAt: string;
  readonly month: PriceLockViewPrice | null;
  readonly year: PriceLockViewPrice | null;
}

export function buildPriceLockView(lock: PriceLockSnapshot): PriceLockView {
  const toPrice = (interval: PriceInterval): PriceLockViewPrice | null => {
    const price = resolveLockedPrice({ lock, interval });
    if (!price?.locked) return null;
    const { amountCents, currency, stripePriceId } = price;
    return { amountCents, currency, interval, priceId: stripePriceId };
  };
  return {
    locked: true,
    priceVersionId: lock.priceVersionId,
    lockedAt: lock.lockedAt,
    month: toPrice('month'),
    year: toPrice('year'),
  };
}

/** Swaps (or adds, if retired) the Pro option for each interval the lock covers. */
export function applyPriceLockToOptions<T extends PricingOption>(
  options: readonly T[],
  lock: PriceLockView | null
): T[] {
  if (!lock) return [...options];
  const toOption = (price: PriceLockViewPrice) => ({
    priceId: price.priceId!,
    amount: price.amountCents,
    currency: price.currency,
    interval: price.interval,
  });
  const handled = new Set<PriceInterval>();
  const out = options.flatMap(option => {
    const interval: PriceInterval | null =
      option.interval === 'month' || option.interval === 'monthly'
        ? 'month'
        : option.interval === 'year' || option.interval === 'yearly'
          ? 'year'
          : null;
    const locked = interval ? lock[interval] : null;
    if (option.plan !== 'pro' || !interval || !locked) return [option];
    if (!locked.priceId || handled.has(interval)) return [];
    handled.add(interval);
    return [{ ...option, ...toOption(locked) }];
  });
  for (const interval of ['month', 'year'] as const) {
    const locked = lock[interval];
    if (handled.has(interval) || !locked?.priceId) continue;
    if (!options.some(o => o.plan === 'pro')) continue;
    out.push({
      ...toOption(locked),
      description: 'Artist Presence',
      plan: 'pro',
    } as unknown as T);
  }
  return out;
}

/** The monthly label (for example "<amount>/mo") for the lock's monthly price, or null when it has none. */
export function lockedMonthlyLabel(lock: PriceLockView | null): string | null {
  return lock?.month ? formatLockedPrice(lock.month) : null;
}

/** Disclosure sentence for a lock, or null when there is nothing to disclose. */
export function lockDisclosure(
  lock: PriceLockView | null,
  interval: PriceInterval = 'month'
): string | null {
  const price = lock?.[interval === 'month' ? 'month' : 'year'];
  return price ? priceLockDisclosure(price) : null;
}

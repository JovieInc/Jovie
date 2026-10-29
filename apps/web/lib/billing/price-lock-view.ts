/**
 * Client-safe view of a person's price lock, and the helpers every client
 * price surface uses so it renders the locked price, never the list price.
 */

import {
  formatLockedPrice,
  type PriceInterval,
  type PriceLockSnapshot,
  priceLockDisclosure,
  resolveLockedPrice,
} from './price-versions';

export interface PriceLockViewPrice {
  readonly amountCents: number;
  readonly currency: string;
  readonly interval: PriceInterval;
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
    return {
      amountCents: price.amountCents,
      currency: price.currency,
      interval,
      priceId: price.stripePriceId,
    };
  };
  return {
    locked: true,
    priceVersionId: lock.priceVersionId,
    lockedAt: lock.lockedAt,
    month: toPrice('month'),
    year: toPrice('year'),
  };
}

export interface PricedOption {
  readonly priceId: string;
  readonly amount: number;
  readonly currency: string;
  readonly interval: string;
  readonly description: string;
  readonly plan?: string;
}

/**
 * Replaces the Pro list option for each interval the lock covers with the
 * locked price. When the lock covers an interval the list no longer offers
 * (a retired price), the locked option is added. Other plans and intervals
 * the lock does not cover are left alone.
 */
export function applyPriceLockToOptions<T extends PricedOption>(
  options: readonly T[],
  lock: PriceLockView | null
): T[] {
  if (!lock) return [...options];
  const out: T[] = [];
  const handled = new Set<PriceInterval>();
  for (const option of options) {
    const interval: PriceInterval | null =
      option.interval === 'month' || option.interval === 'monthly'
        ? 'month'
        : option.interval === 'year' || option.interval === 'yearly'
          ? 'year'
          : null;
    const locked = interval
      ? lock[interval === 'month' ? 'month' : 'year']
      : null;
    if (option.plan === 'pro' && interval && locked?.priceId) {
      if (handled.has(interval)) continue;
      handled.add(interval);
      out.push({
        ...option,
        priceId: locked.priceId,
        amount: locked.amountCents,
        currency: locked.currency,
        interval: locked.interval,
      });
      continue;
    }
    out.push(option);
  }
  for (const interval of ['month', 'year'] as const) {
    const locked = lock[interval];
    if (handled.has(interval) || !locked?.priceId) continue;
    if (!options.some(o => o.plan === 'pro')) continue;
    out.push({
      priceId: locked.priceId,
      amount: locked.amountCents,
      currency: locked.currency,
      interval: locked.interval,
      description: 'Artist Presence',
      plan: 'pro',
    } as unknown as T);
  }
  return out;
}

/** "$12/mo" for the lock's monthly price, or null when it has none. */
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

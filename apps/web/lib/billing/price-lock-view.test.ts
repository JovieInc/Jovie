import { describe, expect, it } from 'vitest';
import {
  applyPriceLockToOptions,
  buildPriceLockView,
  lockDisclosure,
  lockedMonthlyLabel,
} from './price-lock-view';
import type { PriceLockSnapshot } from './price-versions';

const LOCK_12: PriceLockSnapshot = {
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
};
const view = buildPriceLockView(LOCK_12);
const LIST = [
  {
    priceId: 'price_19',
    amount: 1900,
    currency: 'usd',
    interval: 'month',
    description: 'Artist Presence',
    plan: 'pro',
  },
  {
    priceId: 'price_max',
    amount: 14900,
    currency: 'usd',
    interval: 'month',
    description: 'Max',
    plan: 'max',
  },
];

describe('price lock view', () => {
  it('exposes only the intervals the lock covers', () => {
    expect(view.month).toMatchObject({
      amountCents: 1200,
      priceId: 'price_12',
    });
    expect(view.year).toBeNull();
    expect(lockedMonthlyLabel(view)).toBe('$12/mo');
    expect(lockedMonthlyLabel(null)).toBeNull();
  });

  it('discloses only when there is a lock', () => {
    expect(lockDisclosure(view)).toContain('locked at $12/mo');
    expect(lockDisclosure(null)).toBeNull();
    expect(lockDisclosure(view, 'year')).toBeNull();
  });
});

describe('applyPriceLockToOptions', () => {
  it('replaces the pro list option with the locked price and leaves other plans alone', () => {
    const out = applyPriceLockToOptions(LIST, view);
    expect(out[0]).toMatchObject({
      priceId: 'price_12',
      amount: 1200,
      interval: 'month',
      description: 'Artist Presence',
    });
    expect(out[1]).toEqual(LIST[1]);
    expect(out).toHaveLength(2);
  });

  it('collapses the duplicated pricingOptions/options entries into one locked option', () => {
    const out = applyPriceLockToOptions([LIST[0], LIST[0]], view);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(1200);
  });

  it('adds the locked option when the list no longer offers that interval', () => {
    const yearlyOnlyList = [{ ...LIST[0], interval: 'year', amount: 19000 }];
    const out = applyPriceLockToOptions(yearlyOnlyList, view);
    expect(out.map(o => [o.interval, o.amount])).toEqual([
      ['year', 19000],
      ['month', 1200],
    ]);
  });

  it('is the identity without a lock', () => {
    expect(applyPriceLockToOptions(LIST, null)).toEqual(LIST);
  });
});

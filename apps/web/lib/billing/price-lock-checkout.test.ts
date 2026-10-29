import { describe, expect, it } from 'vitest';
import { resolveCheckoutPrice } from './price-lock-checkout';
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
const LIST_19_MONTH = { plan: 'pro', interval: 'month' as const };
const LIST_190_YEAR = { plan: 'pro', interval: 'year' as const };

describe('resolveCheckoutPrice', () => {
  it('without a lock the requested list price is untouched', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_19',
        requestedMapping: LIST_19_MONTH,
        lock: null,
      })
    ).toEqual({ kind: 'list', priceId: 'price_19' });
  });

  it('replaces the list monthly price with the locked monthly price', () => {
    const decision = resolveCheckoutPrice({
      requestedPriceId: 'price_19',
      requestedMapping: LIST_19_MONTH,
      lock: LOCK_12,
    });
    expect(decision).toMatchObject({
      kind: 'locked',
      priceId: 'price_12',
      plan: 'pro',
      substituted: true,
      expectation: { amountCents: 1200, currency: 'usd', interval: 'month' },
    });
  });

  it('accepts the locked price id itself even when it is retired and unmapped', () => {
    const decision = resolveCheckoutPrice({
      requestedPriceId: 'price_12',
      requestedMapping: null,
      lock: LOCK_12,
    });
    expect(decision).toMatchObject({
      kind: 'locked',
      priceId: 'price_12',
      substituted: false,
    });
  });

  it('leaves an interval the lock does not cover on the list price', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_190y',
        requestedMapping: LIST_190_YEAR,
        lock: LOCK_12,
      })
    ).toEqual({ kind: 'list', priceId: 'price_190y' });
  });

  it('never applies a pro lock to another plan', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_max',
        requestedMapping: { plan: 'max', interval: 'month' },
        lock: LOCK_12,
      })
    ).toEqual({ kind: 'list', priceId: 'price_max' });
  });

  it('an unknown price id stays a list id so active-price validation rejects it', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_forged',
        requestedMapping: null,
        lock: LOCK_12,
      })
    ).toEqual({ kind: 'list', priceId: 'price_forged' });
  });

  it('a lock without a Stripe id for the interval falls back to list validation', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_19',
        requestedMapping: LIST_19_MONTH,
        lock: { ...LOCK_12, stripePriceIdMonthly: null },
      })
    ).toEqual({ kind: 'list', priceId: 'price_19' });
  });

  it('a yearly lock is charged on the yearly price, monthly stays list', () => {
    const yearlyLock: PriceLockSnapshot = {
      ...LOCK_12,
      monthlyAmountCents: null,
      stripePriceIdMonthly: null,
      yearlyAmountCents: 19000,
      stripePriceIdYearly: 'price_190y',
    };
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_190y_new',
        requestedMapping: LIST_190_YEAR,
        lock: yearlyLock,
      })
    ).toMatchObject({ kind: 'locked', priceId: 'price_190y' });
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_19',
        requestedMapping: LIST_19_MONTH,
        lock: yearlyLock,
      })
    ).toEqual({ kind: 'list', priceId: 'price_19' });
  });
});

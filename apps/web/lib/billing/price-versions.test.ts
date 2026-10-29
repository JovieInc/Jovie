import { lintCopy } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import {
  assertPriceVersionsValid,
  buildPriceLockFromSubscriptionPrice,
  buildPriceLockSnapshot,
  CURRENT_PRICE_VERSION_ID,
  formatLockedPrice,
  PRICE_VERSIONS,
  type PriceVersion,
  priceLockDisclosure,
  resolveLockedPrice,
} from './price-versions';

const V12: PriceVersion = {
  id: 'pro-v1-12',
  plan: 'pro',
  monthlyUsd: 12,
  yearlyUsd: null,
  currency: 'usd',
  introducedOn: '2026-10-20',
};
const V19: PriceVersion = {
  id: 'pro-v2-19',
  plan: 'pro',
  monthlyUsd: 19,
  yearlyUsd: 190,
  currency: 'usd',
  introducedOn: '2026-10-31',
};
const NOW = new Date('2026-10-29T12:00:00.000Z');
const IDS_12 = { monthly: 'price_12', yearly: null };
const IDS_19 = { monthly: 'price_19', yearly: 'price_190y' };

describe('price version registry', () => {
  it('current version matches the list price (fails when the list price changes without a new version)', () => {
    expect(() => assertPriceVersionsValid()).not.toThrow();
    const current = PRICE_VERSIONS.find(v => v.id === CURRENT_PRICE_VERSION_ID);
    expect(current?.monthlyUsd).toBe(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
  });

  it('is deliberately red when the list price moves and no version is registered', () => {
    expect(() =>
      assertPriceVersionsValid([V12], V12.id, 19)
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: price version mismatch: current version pro-v1-12 is 12 USD per month, list price is 19 USD per month (a new version must be registered and made current)]`
    );
  });

  it('rejects duplicate ids, bad amounts and an unregistered current id', () => {
    expect(() => assertPriceVersionsValid([V12, V12], V12.id, 12)).toThrow(
      /unique/
    );
    expect(() =>
      assertPriceVersionsValid([{ ...V12, monthlyUsd: 0 }], V12.id, 0)
    ).toThrow(/positive/);
    expect(() => assertPriceVersionsValid([V12], 'nope', 12)).toThrow(
      /not registered/
    );
  });
});

describe('a live price change reaches new signups only', () => {
  it('keeps an existing lock on its own snapshot after the list moves to v2', () => {
    const versions = [V12, V19];
    const before = buildPriceLockSnapshot({
      source: 'signup',
      now: NOW,
      stripePriceIds: IDS_12,
      versions,
      currentId: V12.id,
    });
    const after = buildPriceLockSnapshot({
      source: 'signup',
      now: NOW,
      stripePriceIds: IDS_19,
      versions,
      currentId: V19.id,
    });
    expect(before.monthlyAmountCents).toBe(1200);
    expect(before.stripePriceIdMonthly).toBe('price_12');
    expect(after.monthlyAmountCents).toBe(1900);
    expect(after.yearlyAmountCents).toBe(19000);

    // The old lock still resolves to $12 while the list is $19.
    const grandfathered = resolveLockedPrice({
      lock: before,
      interval: 'month',
      listStripePriceIds: IDS_19,
      versions,
      currentId: V19.id,
    });
    expect(grandfathered).toMatchObject({
      amountCents: 1200,
      stripePriceId: 'price_12',
      locked: true,
      priceVersionId: V12.id,
    });
    // A person with no lock sees the new list price.
    expect(
      resolveLockedPrice({
        lock: null,
        interval: 'month',
        listStripePriceIds: IDS_19,
        versions,
        currentId: V19.id,
      })
    ).toMatchObject({ amountCents: 1900, locked: false });
  });
});

describe('resolveLockedPrice', () => {
  const versions = [V12, V19];
  const lock12 = buildPriceLockSnapshot({
    source: 'signup',
    now: NOW,
    stripePriceIds: IDS_12,
    versions,
    currentId: V12.id,
  });

  it('falls to the list price for an interval the lock does not cover', () => {
    const annual = resolveLockedPrice({
      lock: lock12,
      interval: 'year',
      listStripePriceIds: IDS_19,
      versions,
      currentId: V19.id,
    });
    expect(annual).toMatchObject({
      amountCents: 19000,
      locked: false,
      interval: 'year',
    });
  });

  it('returns null when neither the lock nor the list offers the interval', () => {
    expect(
      resolveLockedPrice({
        lock: null,
        interval: 'year',
        versions: [V12],
        currentId: V12.id,
      })
    ).toBeNull();
  });

  it('a yearly-only lock gives no monthly lock', () => {
    const yearly = buildPriceLockFromSubscriptionPrice({
      stripePriceId: 'price_190y',
      plan: 'pro',
      amountCents: 19000,
      interval: 'year',
      currency: 'usd',
      now: NOW,
      versions,
    });
    expect(yearly.monthlyAmountCents).toBeNull();
    expect(yearly.priceVersionId).toBe(V19.id);
    expect(
      resolveLockedPrice({
        lock: yearly,
        interval: 'month',
        versions,
        currentId: V19.id,
      })?.locked
    ).toBe(false);
  });
});

describe('backfill from a subscription price', () => {
  it('grandfathered $12 accounts keep $12 on the registered version', () => {
    const lock = buildPriceLockFromSubscriptionPrice({
      stripePriceId: 'price_12',
      plan: 'pro',
      amountCents: 1200,
      interval: 'month',
      currency: 'usd',
      now: NOW,
      versions: [V12, V19],
    });
    expect(lock).toMatchObject({
      priceVersionId: V12.id,
      monthlyAmountCents: 1200,
      stripePriceIdMonthly: 'price_12',
      source: 'backfill_subscription',
    });
  });

  it('records an unregistered price exactly as paid (the $199 subscriber)', () => {
    const lock = buildPriceLockFromSubscriptionPrice({
      stripePriceId: 'price_199',
      plan: 'pro',
      amountCents: 19900,
      interval: 'month',
      currency: 'usd',
      now: NOW,
      versions: [V12, V19],
    });
    expect(lock.priceVersionId).toBe('sub-price:price_199');
    expect(lock.monthlyAmountCents).toBe(19900);
  });
});

describe('formatting and disclosure copy', () => {
  it('formats whole dollars without cents', () => {
    expect(
      formatLockedPrice({
        amountCents: 1200,
        interval: 'month',
        currency: 'usd',
      })
    ).toBe('$12/mo');
    expect(
      formatLockedPrice({
        amountCents: 19000,
        interval: 'year',
        currency: 'usd',
      })
    ).toBe('$190/yr');
  });

  it('disclosure states the locked amount and passes the copy lint', () => {
    const text = priceLockDisclosure({
      amountCents: 1200,
      interval: 'month',
      currency: 'usd',
    });
    expect(text).toBe(
      'Your price is locked at $12/mo. It stays the same if the list price changes.'
    );
    for (const register of [
      'jovie-product-ui',
      'jovie-marketing',
      'jovie-transactional',
    ] as const) {
      expect(lintCopy(text, { register }).blocking).toEqual([]);
    }
  });
});

/**
 * Property-based tests for Stripe money math and the price table.
 *
 * Locks the amount/currency invariants the checkout and webhook surfaces
 * depend on:
 * - toCents is exact for every representable dollar+cents amount (no float
 *   drift) and always lands on the nearest cent
 * - every active checkout price's amount/currency/interval equals the
 *   published Artist Visibility offer, derived through toCents
 * - price-table lookups are total for known ids and null-closed for unknown
 *   ids; legacy prices never leak into the active checkout set
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockEnv = vi.hoisted(() => ({
  STRIPE_SECRET_KEY: 'sk_test_property',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_property',
  STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_prop_av_pro_monthly',
  STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY:
    'price_prop_yt_founder_monthly',
  STRIPE_PRICE_PRO_ANNUAL: 'price_prop_pro_annual',
  STRIPE_PRICE_MAX_MONTHLY: 'price_prop_max_monthly',
  STRIPE_PRICE_MAX_YEARLY: 'price_prop_max_yearly',
  STRIPE_PRICE_FOUNDING_MONTHLY: 'price_prop_founding_monthly',
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_FEATURE_MAX_PLAN: 'true',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_property',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: 'test',
    NEXT_PUBLIC_PROFILE_HOSTNAME: 'jov.ie',
  },
}));

import {
  ARTIST_VISIBILITY_OFFER,
  PLAN_PRICES,
  toCents,
} from '@/lib/config/plan-prices';
import {
  ACTIVE_PRICE_MAPPINGS,
  getActivePriceIds,
  getPlanFromPriceId,
  getPriceMappingDetails,
  isLegacyFanSendPrice,
  isMaxPriceId,
  PRICE_MAPPINGS,
  type PriceMapping,
} from '@/lib/stripe/config';

const priceIdArb = fc.stringMatching(/^price_prop_[a-z0-9_]{1,24}$/);

describe('toCents (property)', () => {
  it('is exact for every dollar + cents combination', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 99 }),
        (dollars, cents) => {
          expect(toCents(dollars + cents / 100)).toBe(dollars * 100 + cents);
        }
      ),
      { numRuns: 2000 }
    );
  });

  it('always lands on the nearest cent of the input value', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1000, noNaN: true }), dollars => {
        const cents = toCents(dollars);
        const exact = dollars * 100;
        expect(Math.abs(cents - exact)).toBeLessThanOrEqual(0.5);
        expect(cents).toBe(Math.round(exact));
      })
    );
  });

  it('is monotone and maps zero to zero', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 5000, noNaN: true }),
        fc.float({ min: 0, max: 5000, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(toCents(lo)).toBeLessThanOrEqual(toCents(hi));
        }
      )
    );
    expect(toCents(0)).toBe(0);
  });

  it('converts the published offer price without drift', () => {
    expect(toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)).toBe(1200);
    for (const tier of ['pro', 'max'] as const) {
      expect(toCents(PLAN_PRICES[tier].monthly)).toBeGreaterThan(0);
      expect(Number.isInteger(toCents(PLAN_PRICES[tier].monthly))).toBe(true);
      expect(Number.isInteger(toCents(PLAN_PRICES[tier].yearly))).toBe(true);
    }
  });
});

describe('price table (property)', () => {
  const knownPriceIds = Object.keys(PRICE_MAPPINGS);
  const unknownPriceIdArb = priceIdArb.filter(id => !(id in PRICE_MAPPINGS));

  beforeEach(() => {
    expect(knownPriceIds.length).toBeGreaterThan(0);
  });

  it('every mapping carries a positive whole-cent amount in usd', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownPriceIds), priceId => {
        const mapping: PriceMapping = PRICE_MAPPINGS[priceId];
        expect(mapping.priceId).toBe(priceId);
        expect(Number.isInteger(mapping.amount)).toBe(true);
        expect(mapping.amount).toBeGreaterThan(0);
        expect(mapping.currency).toBe('usd');
        expect(['month', 'year']).toContain(mapping.interval);
        expect(mapping.description.length).toBeGreaterThan(0);
        expect(getPriceMappingDetails(priceId)).toEqual(mapping);
      })
    );
  });

  it('active checkout prices mirror the published offer exactly', () => {
    fc.assert(
      fc.property(fc.constantFrom(...getActivePriceIds()), priceId => {
        const mapping = ACTIVE_PRICE_MAPPINGS[priceId];
        expect(mapping.legacy).not.toBe(true);
        expect(mapping.amount).toBe(
          toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)
        );
        expect(mapping.currency).toBe(ARTIST_VISIBILITY_OFFER.pro.currency);
        expect(mapping.interval).toBe(ARTIST_VISIBILITY_OFFER.pro.interval);
        expect(mapping.plan).toBe('pro');
        expect(mapping.offerCapabilities?.canAutoCreateLinks).toBe(true);
      })
    );
    expect(getActivePriceIds()).toEqual([
      mockEnv.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY,
    ]);
  });

  it('legacy prices never leak into the active checkout set', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownPriceIds), priceId => {
        const mapping = PRICE_MAPPINGS[priceId];
        if (mapping.legacy === true) {
          expect(getActivePriceIds()).not.toContain(priceId);
          expect(ACTIVE_PRICE_MAPPINGS[priceId]).toBeUndefined();
        }
      })
    );
  });

  it('plan lookup is total for known ids and null-closed for unknown ids', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownPriceIds), priceId => {
        expect(getPlanFromPriceId(priceId)).toBe(PRICE_MAPPINGS[priceId].plan);
        expect(isMaxPriceId(priceId)).toBe(
          PRICE_MAPPINGS[priceId].plan === 'max'
        );
        expect(isLegacyFanSendPrice(priceId)).toBe(
          PRICE_MAPPINGS[priceId].legacy === true
        );
      })
    );
    fc.assert(
      fc.property(unknownPriceIdArb, priceId => {
        expect(getPlanFromPriceId(priceId)).toBeNull();
        expect(getPriceMappingDetails(priceId)).toBeNull();
        expect(isMaxPriceId(priceId)).toBe(false);
        expect(isLegacyFanSendPrice(priceId)).toBe(false);
      })
    );
    expect(isLegacyFanSendPrice(null)).toBe(false);
    expect(isLegacyFanSendPrice(undefined)).toBe(false);
  });
});

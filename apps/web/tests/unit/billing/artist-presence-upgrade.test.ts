import { describe, expect, it } from 'vitest';
import {
  getArtistPresenceMonthlyPrice,
  normalizeUpgradeReturnTo,
} from '@/lib/billing/artist-presence-upgrade';
import type { PriceLockView } from '@/lib/billing/price-lock-view';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';

const offer = ARTIST_VISIBILITY_OFFER.pro;
const monthly = {
  plan: 'pro',
  priceId: 'price_presence',
  amount: toCents(offer.monthlyUsd),
  currency: offer.currency,
  interval: offer.interval,
  description: offer.displayName,
};
function monthlyLock(
  amountCents: number,
  priceId = 'price_locked'
): PriceLockView {
  return {
    locked: true,
    priceVersionId: 'locked',
    lockedAt: '2026-10-29T00:00:00Z',
    month: { amountCents, currency: 'usd', interval: 'month', priceId },
    year: null,
  };
}
describe('Artist Presence upgrade', () => {
  it('selects the person’s locked monthly price when it differs from the list', () => {
    expect(
      getArtistPresenceMonthlyPrice(
        [{ ...monthly, priceId: 'locked_monthly', amount: monthly.amount / 2 }],
        monthlyLock(monthly.amount / 2, 'locked_monthly')
      )
    ).toBe('locked_monthly');
  });
  it('selects the canonical monthly option, deduplicating the API aliases', () => {
    expect(
      getArtistPresenceMonthlyPrice([
        { ...monthly, priceId: 'annual', interval: 'year' },
        monthly,
        monthly,
      ])
    ).toBe('price_presence');
  });
  it('never falls back to another price or an ambiguous match', () => {
    expect(getArtistPresenceMonthlyPrice([])).toBeUndefined();
    expect(
      getArtistPresenceMonthlyPrice([{ ...monthly, amount: 0 }])
    ).toBeUndefined();
    expect(
      getArtistPresenceMonthlyPrice([{ ...monthly, currency: 'eur' }])
    ).toBeUndefined();
    for (const plan of ['max', 'free', undefined]) {
      expect(
        getArtistPresenceMonthlyPrice([{ ...monthly, plan }])
      ).toBeUndefined();
    }
    expect(
      getArtistPresenceMonthlyPrice([
        monthly,
        { ...monthly, priceId: 'another' },
      ])
    ).toBeUndefined();
  });
  it.each([900, 19900])(
    'selects the exact locked amount %i rather than requiring the list amount',
    amount => {
      const lock = monthlyLock(amount);
      expect(
        getArtistPresenceMonthlyPrice(
          [{ ...monthly, amount, priceId: 'price_locked' }],
          lock
        )
      ).toBe('price_locked');
      expect(getArtistPresenceMonthlyPrice([monthly], lock)).toBeUndefined();
      expect(
        getArtistPresenceMonthlyPrice(
          [{ ...monthly, amount, priceId: 'other' }],
          lock
        )
      ).toBeUndefined();
      expect(
        getArtistPresenceMonthlyPrice([monthly], {
          ...lock,
          month: { ...lock.month!, priceId: null },
        })
      ).toBeUndefined();
    }
  );
  it('uses the canonical monthly offer when only the yearly interval is locked', () => {
    const lock: PriceLockView = {
      locked: true,
      priceVersionId: 'yearly',
      lockedAt: '2026-10-29T00:00:00Z',
      month: null,
      year: {
        amountCents: 19200,
        currency: 'usd',
        interval: 'year',
        priceId: 'price_yearly',
      },
    };
    expect(getArtistPresenceMonthlyPrice([monthly], lock)).toBe(
      'price_presence'
    );
    expect(
      getArtistPresenceMonthlyPrice([{ ...monthly, amount: 1 }], lock)
    ).toBeUndefined();
  });
  it('preserves a screen and query without a fragment', () => {
    expect(normalizeUpgradeReturnTo('/app/releases?release=123#edit')).toBe(
      '/app/releases?release=123'
    );
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/app/../../signin',
    '/app\\evil.test',
    '/%2f%2fevil.test',
    '/app/%0aevil',
    '/app/%',
    '/app-other',
    null,
  ])('rejects an invalid return destination %s', value => {
    expect(normalizeUpgradeReturnTo(value)).toBe('/app');
  });
});

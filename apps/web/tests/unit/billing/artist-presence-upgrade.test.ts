import { describe, expect, it } from 'vitest';
import {
  getArtistPresenceMonthlyPrice,
  normalizeUpgradeReturnTo,
} from '@/lib/billing/artist-presence-upgrade';
import type { PriceLockView } from '@/lib/billing/price-lock-view';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';

const offer = ARTIST_VISIBILITY_OFFER.pro;
const monthly = {
  priceId: 'price_presence',
  amount: toCents(offer.monthlyUsd),
  currency: offer.currency,
  interval: offer.interval,
  description: offer.displayName,
};
describe('Artist Presence upgrade', () => {
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
      getArtistPresenceMonthlyPrice([{ ...monthly, amount: 1 }])
    ).toBeUndefined();
    expect(
      getArtistPresenceMonthlyPrice([{ ...monthly, currency: 'eur' }])
    ).toBeUndefined();
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
      const lock: PriceLockView = {
        locked: true,
        priceVersionId: 'locked',
        lockedAt: '2026-10-29T00:00:00Z',
        month: {
          amountCents: amount,
          currency: 'usd',
          interval: 'month',
          priceId: 'price_locked',
        },
        year: null,
      };
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

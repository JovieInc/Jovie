import { describe, expect, it } from 'vitest';
import {
  getArtistPresenceMonthlyPrice,
  normalizeUpgradeReturnTo,
} from '@/lib/billing/artist-presence-upgrade';
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
describe('Artist Presence upgrade', () => {
  it('selects the person’s locked monthly price when it differs from the list', () => {
    expect(
      getArtistPresenceMonthlyPrice([
        { ...monthly, priceId: 'locked_monthly', amount: monthly.amount / 2 },
      ])
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

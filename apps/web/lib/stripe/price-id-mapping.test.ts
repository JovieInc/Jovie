import { describe, expect, it } from 'vitest';
import {
  ARTIST_VISIBILITY_PRO_MONTHLY_PRICE_IDS,
  LEGACY_STRIPE_PRICE_IDS,
  resolveArtistVisibilityProMonthlyPriceId,
} from './price-id-mapping';

const { live, test } = ARTIST_VISIBILITY_PRO_MONTHLY_PRICE_IDS;

describe('resolveArtistVisibilityProMonthlyPriceId', () => {
  it('uses the live Artist Presence price when a live key carries the test-account price', () => {
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: test,
        secretKey: 'sk_live_fixture',
      })
    ).toBe(live);
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: `  ${test}  `,
        secretKey: 'rk_live_fixture',
      })
    ).toBe(live);
  });

  it('uses the test Artist Presence price when a test key carries the live-account price', () => {
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: live,
        secretKey: 'sk_test_fixture',
      })
    ).toBe(test);
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: LEGACY_STRIPE_PRICE_IDS.artistPresenceLimitedMonthly,
        secretKey: 'rk_test_fixture',
      })
    ).toBe(test);
  });

  it('keeps a price that already belongs to the secret key account', () => {
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: live,
        secretKey: 'sk_live_fixture',
      })
    ).toBe(live);
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: test,
        secretKey: 'sk_test_fixture',
      })
    ).toBe(test);
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: LEGACY_STRIPE_PRICE_IDS.artistPresenceLimitedMonthly,
        secretKey: 'sk_live_fixture',
      })
    ).toBe(LEGACY_STRIPE_PRICE_IDS.artistPresenceLimitedMonthly);
  });

  it('does not invent a price when the env value is missing or the key mode is unknown', () => {
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: undefined,
        secretKey: 'sk_live_fixture',
      })
    ).toBeUndefined();
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: '   ',
        secretKey: 'sk_test_fixture',
      })
    ).toBeUndefined();
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: test,
        secretKey: undefined,
      })
    ).toBe(test);
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: 'price_visibility',
        secretKey: 'sk_live_fixture',
      })
    ).toBe('price_visibility');
    expect(
      resolveArtistVisibilityProMonthlyPriceId({
        configuredPriceId: test,
        secretKey: 'not-a-stripe-key',
      })
    ).toBe(test);
  });
});

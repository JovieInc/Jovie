import { describe, expect, it } from 'vitest';
import {
  type ArtistVisibilityStripePrice,
  assertArtistVisibilityStripeTestPrice,
  getRequiredStripeTestConfig,
} from '@/tests/e2e/helpers/stripe-test-price-contract';

const validPrice: ArtistVisibilityStripePrice = {
  active: true,
  currency: 'usd',
  livemode: false,
  recurring: { interval: 'month' } as NonNullable<
    ArtistVisibilityStripePrice['recurring']
  >,
  unit_amount: 19_900,
};

describe('Artist Visibility Stripe test price contract', () => {
  it('requires the dedicated test-mode price and rejects legacy-only configuration', () => {
    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_SECRET_KEY: 'sk_test_fixture',
        STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
      })
    ).toThrow('STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY');

    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: undefined,
        STRIPE_SECRET_KEY: 'sk_test_fixture',
        STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
        STRIPE_PRICE_PRO_MONTHLY: 'price_legacy_39',
        STRIPE_PRICE_PRO_YEARLY: 'price_legacy_375',
        STRIPE_PRICE_STANDARD_MONTHLY: 'price_standard',
      })
    ).toThrow('STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY');

    expect(
      getRequiredStripeTestConfig({
        STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_visibility_test',
        STRIPE_SECRET_KEY: 'sk_test_fixture',
        STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
      })
    ).toEqual({
      priceId: 'price_visibility_test',
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
    });
  });

  it('requires a test secret and webhook signature secret', () => {
    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_visibility_test',
        STRIPE_SECRET_KEY: 'sk_live_fixture',
        STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
      })
    ).toThrow('STRIPE_SECRET_KEY must be an sk_test_ key');

    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_visibility_test',
        STRIPE_SECRET_KEY: 'sk_test_fixture',
      })
    ).toThrow('STRIPE_WEBHOOK_SECRET is not configured');
  });

  it('accepts the active test-mode USD 199 monthly offer', () => {
    expect(() =>
      assertArtistVisibilityStripeTestPrice(validPrice)
    ).not.toThrow();
  });

  it.each([
    ['live mode', { livemode: true }],
    ['inactive price', { active: false }],
    ['wrong currency', { currency: 'eur' }],
    ['wrong amount', { unit_amount: 3_900 }],
    ['wrong interval', { recurring: { interval: 'year' } }],
    ['one-time price', { recurring: null }],
  ])(
    'rejects %s before using it for the money-path test',
    (_name, mismatch) => {
      expect(() =>
        assertArtistVisibilityStripeTestPrice({ ...validPrice, ...mismatch })
      ).toThrow('Configured Stripe test price must be active');
    }
  );
});

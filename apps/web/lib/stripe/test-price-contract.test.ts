import { describe, expect, it } from 'vitest';
import {
  type ArtistVisibilityStripePrice,
  assertArtistVisibilityStripeTestPrice,
  assertStripeTestAccount,
  getRequiredStripeTestConfig,
  type StripeTestEnvironment,
} from './test-price-contract';

const validRecurring = {
  interval: 'month',
  interval_count: 1,
  usage_type: 'licensed',
} as NonNullable<ArtistVisibilityStripePrice['recurring']>;

const validPrice: ArtistVisibilityStripePrice = {
  active: true,
  billing_scheme: 'per_unit',
  currency: 'usd',
  livemode: false,
  metadata: { issue: 'JOV-6218', offer: 'artist_visibility_pro' },
  recurring: validRecurring,
  transform_quantity: null,
  type: 'recurring',
  unit_amount: 19_900,
};

const validConfig = {
  STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_visibility_test',
  STRIPE_TEST_ACCOUNT_ID: 'acct_test_jovie',
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
} as const;

describe('Artist Visibility Stripe test price contract', () => {
  it('requires the dedicated test-mode price and rejects legacy-only configuration', () => {
    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_TEST_ACCOUNT_ID: validConfig.STRIPE_TEST_ACCOUNT_ID,
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
        STRIPE_TEST_ACCOUNT_ID: validConfig.STRIPE_TEST_ACCOUNT_ID,
      } as StripeTestEnvironment)
    ).toThrow('STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY');

    expect(
      getRequiredStripeTestConfig({
        ...validConfig,
      })
    ).toEqual({
      priceId: 'price_visibility_test',
      accountId: 'acct_test_jovie',
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
    });
  });

  it('requires a test secret and webhook signature secret', () => {
    expect(() =>
      getRequiredStripeTestConfig({
        STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY:
          validConfig.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY,
        STRIPE_SECRET_KEY: validConfig.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: validConfig.STRIPE_WEBHOOK_SECRET,
      })
    ).toThrow('STRIPE_TEST_ACCOUNT_ID is not configured');

    expect(() =>
      getRequiredStripeTestConfig({
        ...validConfig,
        STRIPE_SECRET_KEY: 'sk_live_fixture',
      })
    ).toThrow('STRIPE_SECRET_KEY must be an sk_test_ key');

    expect(() =>
      getRequiredStripeTestConfig({
        ...validConfig,
        STRIPE_SECRET_KEY: 'sk_test_fixture',
        STRIPE_WEBHOOK_SECRET: undefined,
      })
    ).toThrow('STRIPE_WEBHOOK_SECRET is not configured');
  });

  it('requires the expected Stripe account before using its catalog', () => {
    expect(() =>
      assertStripeTestAccount('acct_wrong', 'acct_test_jovie')
    ).toThrow('expected acct_test_jovie');
    expect(() =>
      assertStripeTestAccount('acct_test_jovie', 'acct_test_jovie')
    ).not.toThrow();
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
    ['wrong type', { type: 'one_time' }],
    ['wrong billing scheme', { billing_scheme: 'tiered' }],
    ['wrong interval', { recurring: { ...validRecurring, interval: 'year' } }],
    [
      'wrong recurrence count',
      { recurring: { ...validRecurring, interval_count: 2 } },
    ],
    [
      'wrong usage type',
      { recurring: { ...validRecurring, usage_type: 'metered' } },
    ],
    [
      'wrong transform quantity',
      { transform_quantity: { divide_by: 10, round: 'up' } },
    ],
    ['wrong offer metadata', { metadata: { issue: 'JOV-17747' } }],
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

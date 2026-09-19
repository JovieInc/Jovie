import type Stripe from 'stripe';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';

export interface StripeTestEnvironment {
  readonly STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY?: string;
  /** Account that owns the dedicated non-live Artist Visibility fixture. */
  readonly STRIPE_TEST_ACCOUNT_ID?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_WEBHOOK_SECRET?: string;
}

export type ArtistVisibilityStripePrice = Pick<
  Stripe.Price,
  | 'active'
  | 'billing_scheme'
  | 'currency'
  | 'livemode'
  | 'metadata'
  | 'recurring'
  | 'transform_quantity'
  | 'type'
  | 'unit_amount'
>;

/** Resolve the only price eligible for the Artist Visibility money-path test. */
export function getRequiredStripeTestConfig(env: StripeTestEnvironment): {
  readonly accountId: string;
  readonly priceId: string;
  readonly secretKey: string;
  readonly webhookSecret: string;
} {
  const priceId = env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY;
  const accountId = env.STRIPE_TEST_ACCOUNT_ID;
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!priceId) {
    throw new Error(
      'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY is not configured for Stripe test mode'
    );
  }
  if (!accountId) {
    throw new Error(
      'STRIPE_TEST_ACCOUNT_ID is not configured for Stripe test mode'
    );
  }
  if (!secretKey?.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must be an sk_test_ key');
  }
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return { accountId, priceId, secretKey, webhookSecret };
}

/** Fail closed when a test key points at a different Stripe account. */
export function assertStripeTestAccount(
  actualAccountId: string,
  expectedAccountId: string
): void {
  if (actualAccountId !== expectedAccountId) {
    throw new Error(
      `Configured Stripe test key belongs to ${actualAccountId}; expected ${expectedAccountId}`
    );
  }
}

/** Require the Stripe fixture to match the published monthly offer exactly. */
export function assertArtistVisibilityStripeTestPrice(
  price: ArtistVisibilityStripePrice
): void {
  const expectedAmount = toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
  if (
    price.livemode !== false ||
    price.active !== true ||
    price.currency !== ARTIST_VISIBILITY_OFFER.pro.currency ||
    price.unit_amount !== expectedAmount ||
    price.type !== 'recurring' ||
    price.billing_scheme !== 'per_unit' ||
    price.transform_quantity !== null ||
    price.recurring?.interval !== ARTIST_VISIBILITY_OFFER.pro.interval ||
    price.recurring?.interval_count !== 1 ||
    price.recurring?.usage_type !== 'licensed' ||
    price.metadata?.issue !== 'JOV-6218' ||
    price.metadata?.offer !== 'artist_visibility_pro'
  ) {
    throw new Error(
      `Configured Stripe test price must be active, test-mode USD ${expectedAmount}/month`
    );
  }
}

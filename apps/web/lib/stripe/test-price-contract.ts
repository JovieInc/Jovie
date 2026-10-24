import type Stripe from 'stripe';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { getStripePriceIdsFromEnv } from './price-id-mapping';

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
  const priceId = getStripePriceIdsFromEnv(env).artistVisibilityProMonthly;
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

/**
 * Metadata stamped on the Stripe price that carries the current offer
 * (EVENT: Tim, 2026-10-20 — $12/month self-serve artist profile). The retired
 * $199 fixture carried `issue: JOV-6218` and must no longer match.
 */
export const ARTIST_VISIBILITY_PRICE_METADATA = {
  offer: 'artist_visibility_pro',
  decision: 'tim-2026-10-20-artist-profile-12',
} as const;

/** Field names that differ from the published monthly offer. No price id or amount. */
function artistVisibilityStripeTestPriceMismatches(
  price: ArtistVisibilityStripePrice
): readonly string[] {
  const expectedAmount = toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
  const mismatches: string[] = [];
  if (price.livemode !== false) mismatches.push('livemode');
  if (price.active !== true) mismatches.push('active');
  if (price.currency !== ARTIST_VISIBILITY_OFFER.pro.currency) {
    mismatches.push('currency');
  }
  if (price.unit_amount !== expectedAmount) mismatches.push('unit_amount');
  if (price.type !== 'recurring') mismatches.push('type');
  if (price.billing_scheme !== 'per_unit') mismatches.push('billing_scheme');
  if (price.transform_quantity !== null) mismatches.push('transform_quantity');
  if (price.recurring?.interval !== ARTIST_VISIBILITY_OFFER.pro.interval) {
    mismatches.push('recurring.interval');
  }
  if (price.recurring?.interval_count !== 1) {
    mismatches.push('recurring.interval_count');
  }
  if (price.recurring?.usage_type !== 'licensed') {
    mismatches.push('recurring.usage_type');
  }
  if (price.metadata?.decision !== ARTIST_VISIBILITY_PRICE_METADATA.decision) {
    mismatches.push('metadata.decision');
  }
  if (price.metadata?.offer !== ARTIST_VISIBILITY_PRICE_METADATA.offer) {
    mismatches.push('metadata.offer');
  }
  return mismatches;
}

/**
 * Require the Stripe fixture to match the published monthly offer exactly.
 *
 * `FEATURE_STRIPE_TEST_PRICE_CONFIGURED` does not relax this. While it is off,
 * a mismatch names the GitHub Actions secret Golden Path actually reads.
 */
export function assertArtistVisibilityStripeTestPrice(
  price: ArtistVisibilityStripePrice
): void {
  const mismatches = artistVisibilityStripeTestPriceMismatches(price);
  if (mismatches.length === 0) return;

  const expectedAmount = toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
  const contract = `Configured Stripe test price must be active, test-mode USD ${expectedAmount}/month`;
  const fields = `Mismatched fields: ${mismatches.join(', ')}`;
  if (!isCodeFlagEnabled('STRIPE_TEST_PRICE_CONFIGURED')) {
    throw new Error(
      [
        'Stripe test price config is missing: GitHub Actions secret STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY on JovieInc/Jovie',
        `(Golden Path environment "Preview – jovie") is not an active test-mode USD ${expectedAmount}/month price`,
        `with metadata offer=${ARTIST_VISIBILITY_PRICE_METADATA.offer} and decision=${ARTIST_VISIBILITY_PRICE_METADATA.decision}.`,
        'FEATURE_STRIPE_TEST_PRICE_CONFIGURED is off.',
        'The Vercel project jovie stores the same name and this check does not read it.',
        `${contract}. ${fields}.`,
      ].join(' ')
    );
  }

  throw new Error(`${contract}. ${fields}.`);
}

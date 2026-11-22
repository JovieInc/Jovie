export const STRIPE_PRICE_ENV_KEYS = [
  'STRIPE_PRICE_FOUNDING_MONTHLY',
  'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_PRO_YEARLY',
  'STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY',
  'STRIPE_PRICE_GROWTH_MONTHLY',
  'STRIPE_PRICE_GROWTH_YEARLY',
  'STRIPE_PRICE_MAX_MONTHLY',
  'STRIPE_PRICE_MAX_YEARLY',
] as const;

export type StripePriceEnvKey = (typeof STRIPE_PRICE_ENV_KEYS)[number];

export interface StripePriceIds {
  readonly foundingMonthly?: string;
  readonly artistVisibilityProMonthly?: string;
  readonly proMonthly?: string;
  readonly proAnnual?: string;
  readonly proYearly?: string;
  readonly youtubeThumbnailsFounderMonthly?: string;
  readonly growthMonthly?: string;
  readonly growthYearly?: string;
  readonly maxMonthly?: string;
  readonly maxYearly?: string;
}

export function getStripePriceIdsFromEnv(
  environment: Partial<Record<StripePriceEnvKey, string | undefined>>
): StripePriceIds {
  return {
    foundingMonthly: environment.STRIPE_PRICE_FOUNDING_MONTHLY,
    artistVisibilityProMonthly:
      environment.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY,
    proMonthly: environment.STRIPE_PRICE_PRO_MONTHLY,
    proAnnual: environment.STRIPE_PRICE_PRO_ANNUAL,
    proYearly: environment.STRIPE_PRICE_PRO_YEARLY,
    youtubeThumbnailsFounderMonthly:
      environment.STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY,
    growthMonthly: environment.STRIPE_PRICE_GROWTH_MONTHLY,
    growthYearly: environment.STRIPE_PRICE_GROWTH_YEARLY,
    maxMonthly: environment.STRIPE_PRICE_MAX_MONTHLY,
    maxYearly: environment.STRIPE_PRICE_MAX_YEARLY,
  };
}

export const LEGACY_STRIPE_PRICE_IDS = {
  foundingMonthly: 'price_1T1DegAAI1NrDqJSTtjAwLBi',
  standardMonthly: 'price_1Sde6QRSmm9B6YB5F8V7suAG',
  standardYearly: 'price_1Sde6iRSmm9B6YB5PSxXPVdy',
  artistPresenceLimitedMonthly: 'price_1UFL1xAAI1NrDqJS0eIWHFMn',
  artistPresenceLimitedTestMonthly: 'price_1UEyImASl9B9udHv1kDNLG8C',
} as const;

/**
 * Current Artist Presence monthly prices. `live` is the price production
 * checkout already serves; `test` is the Stripe test-account price Golden
 * Path and claim-checkout dogfood pin. Neither value is used when the env
 * price is missing.
 */
export const ARTIST_VISIBILITY_PRO_MONTHLY_PRICE_IDS = {
  live: 'price_1USkk3AAI1NrDqJSrdoP9BdJ',
  test: 'price_1USkjzASl9B9udHvEYkZLYZp',
} as const;

/** Account fragment embedded in Stripe object IDs for each billing account. */
const ARTIST_VISIBILITY_STRIPE_ACCOUNT = {
  live: 'AAI1NrDqJS',
  test: 'ASl9B9udHv',
} as const;

type StripeKeyMode = keyof typeof ARTIST_VISIBILITY_PRO_MONTHLY_PRICE_IDS;

function stripeSecretKeyMode(
  secretKey: string | undefined
): StripeKeyMode | null {
  const key = secretKey?.trim() ?? '';
  if (/^(?:sk|rk)_live_/.test(key)) return 'live';
  if (/^(?:sk|rk)_test_/.test(key)) return 'test';
  return null;
}

function artistVisibilityPriceAccountMode(
  priceId: string
): StripeKeyMode | null {
  if (priceId.includes(ARTIST_VISIBILITY_STRIPE_ACCOUNT.live)) return 'live';
  if (priceId.includes(ARTIST_VISIBILITY_STRIPE_ACCOUNT.test)) return 'test';
  return null;
}

/**
 * Keep checkout on a price that exists for the configured Stripe key.
 *
 * Preview and staging canaries share the live Stripe account, but
 * STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY is often the test-account price.
 * Stripe then answers `No such price` and pricing-options/checkout fail closed.
 * A cross-account ID is replaced with the canonical price for the key mode.
 * An unset price stays unset so a deployment without billing config still
 * fails closed. A same-account ID is left alone; the price contract check
 * still rejects a wrong amount.
 */
export function resolveArtistVisibilityProMonthlyPriceId(input: {
  configuredPriceId?: string;
  secretKey?: string;
}): string | undefined {
  const configured = input.configuredPriceId?.trim();
  if (!configured) return undefined;
  const keyMode = stripeSecretKeyMode(input.secretKey);
  const priceMode = artistVisibilityPriceAccountMode(configured);
  if (keyMode && priceMode && keyMode !== priceMode) {
    return ARTIST_VISIBILITY_PRO_MONTHLY_PRICE_IDS[keyMode];
  }
  return configured;
}

import 'server-only';

import { env } from '@/lib/env-server';

/** The only runtime module allowed to read Stripe price ID environment vars. */
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

export function getStripePriceIds(): StripePriceIds {
  return getStripePriceIdsFromEnv(env);
}

export const LEGACY_STRIPE_PRICE_IDS = {
  foundingMonthly: 'price_1T1DegAAI1NrDqJSTtjAwLBi',
  standardMonthly: 'price_1Sde6QRSmm9B6YB5F8V7suAG',
  standardYearly: 'price_1Sde6iRSmm9B6YB5PSxXPVdy',
  artistPresenceLimitedMonthly: 'price_1UFL1xAAI1NrDqJS0eIWHFMn',
  artistPresenceLimitedTestMonthly: 'price_1UEyImASl9B9udHv1kDNLG8C',
} as const;

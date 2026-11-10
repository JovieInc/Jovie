import 'server-only';

import { getStripePriceIds } from '@/lib/stripe/price-ids';
import { ARTIST_VISIBILITY_OFFER, PLAN_PRICES, toCents } from './plan-prices';

export const PRICING = {
  pro: {
    monthly: {
      priceId: getStripePriceIds().artistVisibilityProMonthly,
      amount: toCents(PLAN_PRICES.pro.monthly),
      label: ARTIST_VISIBILITY_OFFER.pro.displayName,
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'month',
    },
    annual: {
      priceId: getStripePriceIds().proAnnual || getStripePriceIds().proYearly,
      amount: toCents(PLAN_PRICES.pro.yearly),
      label: `${ARTIST_VISIBILITY_OFFER.pro.displayName} Annual`,
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'year',
    },
  },
  max: {
    monthly: {
      priceId:
        getStripePriceIds().maxMonthly || getStripePriceIds().growthMonthly,
      amount: toCents(PLAN_PRICES.max.monthly),
      label: 'Max Monthly',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'month',
    },
    annual: {
      priceId:
        getStripePriceIds().maxYearly || getStripePriceIds().growthYearly,
      amount: toCents(PLAN_PRICES.max.yearly),
      label: 'Max Annual',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'year',
    },
  },
} as const;

export type PlanTier = 'free' | 'pro' | 'max';

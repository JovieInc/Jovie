import 'server-only';

import { env } from '@/lib/env-server';
import { PLAN_PRICES, toCents } from './plan-prices';

export const PRICING = {
  pro: {
    monthly: {
      priceId: env.STRIPE_PRICE_PRO_MONTHLY,
      amount: toCents(PLAN_PRICES.pro.monthly),
      label: 'Pro',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_PRO_ANNUAL || env.STRIPE_PRICE_PRO_YEARLY,
      amount: toCents(PLAN_PRICES.pro.yearly),
      label: 'Pro Annual',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'year',
    },
  },
  max: {
    monthly: {
      priceId: env.STRIPE_PRICE_MAX_MONTHLY || env.STRIPE_PRICE_GROWTH_MONTHLY,
      amount: toCents(PLAN_PRICES.max.monthly),
      label: 'Max Monthly',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_MAX_YEARLY || env.STRIPE_PRICE_GROWTH_YEARLY,
      amount: toCents(PLAN_PRICES.max.yearly),
      label: 'Max Annual',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'year',
    },
  },
} as const;

export type PlanTier = 'free' | 'pro' | 'max';

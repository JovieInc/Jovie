import 'server-only';

import { env } from '@/lib/env-server';

export const PRICING = {
  pro: {
    monthly: {
      priceId: env.STRIPE_PRICE_PRO_MONTHLY,
      amount: 2000,
      label: 'Pro',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_PRO_ANNUAL || env.STRIPE_PRICE_PRO_YEARLY,
      amount: 19200,
      label: 'Pro Annual',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'year',
    },
  },
  max: {
    monthly: {
      priceId: env.STRIPE_PRICE_MAX_MONTHLY || env.STRIPE_PRICE_GROWTH_MONTHLY,
      amount: 20000,
      label: 'Max Monthly',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_MAX_YEARLY || env.STRIPE_PRICE_GROWTH_YEARLY,
      amount: 192000,
      label: 'Max Annual',
      entitlementPlan: 'max',
      billingTier: 'max',
      interval: 'year',
    },
  },
} as const;

export type PlanTier = 'free' | 'pro' | 'max';

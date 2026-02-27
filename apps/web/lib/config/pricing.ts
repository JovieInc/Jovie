import { env } from '@/lib/env-server';

export const PRICING = {
  founding: {
    monthly: {
      priceId: env.STRIPE_PRICE_FOUNDING_MONTHLY,
      amount: 900,
      label: 'Founding Member',
      entitlementPlan: 'pro',
      billingTier: 'founding',
      interval: 'month',
    },
  },
  pro: {
    monthly: {
      priceId: env.STRIPE_PRICE_PRO_MONTHLY,
      amount: 3900,
      label: 'Pro',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_PRO_ANNUAL || env.STRIPE_PRICE_PRO_YEARLY,
      amount: 34800,
      label: 'Pro Annual',
      entitlementPlan: 'pro',
      billingTier: 'pro',
      interval: 'year',
    },
  },
  growth: {
    monthly: {
      priceId: env.STRIPE_PRICE_GROWTH_MONTHLY,
      amount: 9900,
      label: 'Growth Monthly',
      entitlementPlan: 'growth',
      billingTier: 'growth',
      interval: 'month',
    },
    annual: {
      priceId: env.STRIPE_PRICE_GROWTH_YEARLY,
      amount: 94800,
      label: 'Growth Annual',
      entitlementPlan: 'growth',
      billingTier: 'growth',
      interval: 'year',
    },
  },
} as const;

export type PlanTier = 'free' | 'founding' | 'pro' | 'growth';

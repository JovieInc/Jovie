import 'server-only';
import { env } from '@/lib/env-server';

/**
 * Centralized pricing configuration.
 *
 * Maps internal plan tiers to their Stripe price IDs and display metadata.
 * Adding a new tier requires: a new Stripe Price, a new env var, and a new entry here.
 */
export const PRICING = {
  founding: {
    monthly: {
      priceId: env.STRIPE_PRICE_FOUNDING_MONTHLY,
      amount: 900,
      label: 'Founding Member',
    },
  },
  pro: {
    monthly: {
      priceId: env.STRIPE_PRICE_PRO_MONTHLY,
      amount: 3900,
      label: 'Pro',
    },
    annual: {
      priceId: env.STRIPE_PRICE_PRO_YEARLY,
      amount: 34800,
      label: 'Pro Annual',
    },
  },
} as const;

export type PlanTier = 'free' | 'founding' | 'pro';

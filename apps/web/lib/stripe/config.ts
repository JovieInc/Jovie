/**
 * Stripe Configuration and Price-to-Plan Mapping
 *
 * This file contains the centralized mapping of Stripe price IDs to internal plan names.
 * Only used on the server side for security.
 *
 * Pricing Tiers:
 * - Free: $0 (no Stripe subscription)
 * - Founding: $9/mo (early supporter pricing, locked in for life)
 * - Pro: $20/mo or $192/yr (save 2 months)
 * - Max: $200/mo or $1,920/yr (save 2 months)
 */

import 'server-only';

import { PRICING } from '@/lib/config/pricing';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

// Plan types supported by the application
export type PlanType = 'free' | 'founding' | 'pro' | 'max';

// Price mapping interface
interface PriceMapping {
  priceId: string;
  plan: PlanType;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  description: string;
}

// Current active price mappings
const buildPriceMappings = (): Record<string, PriceMapping> => {
  const mappings: PriceMapping[] = [
    // All tiers from centralized PRICING config
    {
      priceId: PRICING.founding.monthly.priceId || '',
      plan: PRICING.founding.monthly.entitlementPlan,
      amount: PRICING.founding.monthly.amount,
      currency: 'usd',
      interval: PRICING.founding.monthly.interval,
      description: PRICING.founding.monthly.label,
    },
    {
      priceId: PRICING.pro.monthly.priceId || '',
      plan: PRICING.pro.monthly.entitlementPlan,
      amount: PRICING.pro.monthly.amount,
      currency: 'usd',
      interval: PRICING.pro.monthly.interval,
      description: PRICING.pro.monthly.label,
    },
    {
      priceId: PRICING.pro.annual.priceId || '',
      plan: PRICING.pro.annual.entitlementPlan,
      amount: PRICING.pro.annual.amount,
      currency: 'usd',
      interval: PRICING.pro.annual.interval,
      description: PRICING.pro.annual.label,
    },
    {
      priceId: PRICING.max.monthly.priceId || '',
      plan: PRICING.max.monthly.entitlementPlan,
      amount: PRICING.max.monthly.amount,
      currency: 'usd',
      interval: PRICING.max.monthly.interval,
      description: PRICING.max.monthly.label,
    },
    {
      priceId: PRICING.max.annual.priceId || '',
      plan: PRICING.max.annual.entitlementPlan,
      amount: PRICING.max.annual.amount,
      currency: 'usd',
      interval: PRICING.max.annual.interval,
      description: PRICING.max.annual.label,
    },
  ];

  return mappings
    .filter(mapping => Boolean(mapping.priceId))
    .reduce<Record<string, PriceMapping>>((acc, mapping) => {
      acc[mapping.priceId] = mapping;
      return acc;
    }, {});
};

export const PRICE_MAPPINGS: Record<string, PriceMapping> =
  buildPriceMappings();

/**
 * Get plan type from Stripe price ID
 * Used in webhooks to determine which plan to assign
 */
export function getPlanFromPriceId(priceId: string): PlanType | null {
  const mapping = PRICE_MAPPINGS[priceId];
  return mapping?.plan || null;
}

/**
 * Get all currently active price IDs for checkout
 */
export function getActivePriceIds(): string[] {
  return Object.values(PRICE_MAPPINGS).map(mapping => mapping.priceId);
}

/**
 * Get price mapping details for a specific price ID
 */
export function getPriceMappingDetails(priceId: string): PriceMapping | null {
  return PRICE_MAPPINGS[priceId] || null;
}

/**
 * Get all available pricing options for the frontend
 * Filters based on what's currently active
 */
export function getAvailablePricing() {
  return Object.values(PRICE_MAPPINGS).sort((a, b) => a.amount - b.amount);
}

export function isMaxPlanEnabled(): boolean {
  return publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';
}

export function isMaxPriceId(priceId: string): boolean {
  return getPlanFromPriceId(priceId) === 'max';
}

/**
 * Validate that all required environment variables are set
 */
export function validateStripeConfig(): {
  isValid: boolean;
  missingVars: string[];
} {
  const requiredVars = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

  const missingVars = requiredVars.filter(
    varName => !env[varName as keyof typeof env]
  );

  if (!publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    missingVars.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  }

  // Founding tier is the primary paid product — must be configured
  if (!env.STRIPE_PRICE_FOUNDING_MONTHLY) {
    missingVars.push('STRIPE_PRICE_FOUNDING_MONTHLY');
  }

  if (!env.STRIPE_PRICE_PRO_MONTHLY) {
    missingVars.push('STRIPE_PRICE_PRO_MONTHLY');
  }

  if (!env.STRIPE_PRICE_PRO_ANNUAL && !env.STRIPE_PRICE_PRO_YEARLY) {
    missingVars.push('STRIPE_PRICE_PRO_ANNUAL');
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

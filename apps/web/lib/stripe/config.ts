/**
 * Stripe Configuration and Price-to-Plan Mapping
 *
 * This file contains the centralized mapping of Stripe price IDs to internal plan names.
 * Only used on the server side for security.
 *
 * Pricing Tiers:
 * - Free: $0 (no Stripe subscription)
 * - Pro: $39/mo or $348/yr (save 2 months)
 * - Growth: $99/mo or $948/yr (save 2 months) - Coming soon
 */

import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

// Plan types supported by the application
export type PlanType = 'free' | 'pro' | 'growth';

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
    // Pro tier pricing
    {
      priceId: env.STRIPE_PRICE_PRO_MONTHLY || '',
      plan: 'pro',
      amount: 3900, // $39/mo
      currency: 'usd',
      interval: 'month',
      description: 'Pro Monthly',
    },
    {
      priceId: env.STRIPE_PRICE_PRO_YEARLY || '',
      plan: 'pro',
      amount: 34800, // $348/yr (save 2 months)
      currency: 'usd',
      interval: 'year',
      description: 'Pro Yearly',
    },
    // Growth tier pricing (coming soon)
    {
      priceId: env.STRIPE_PRICE_GROWTH_MONTHLY || '',
      plan: 'growth',
      amount: 9900, // $99/mo
      currency: 'usd',
      interval: 'month',
      description: 'Growth Monthly',
    },
    {
      priceId: env.STRIPE_PRICE_GROWTH_YEARLY || '',
      plan: 'growth',
      amount: 94800, // $948/yr (save 2 months)
      currency: 'usd',
      interval: 'year',
      description: 'Growth Yearly',
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

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

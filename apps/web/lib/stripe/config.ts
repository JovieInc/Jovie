/**
 * Stripe Configuration and Price-to-Plan Mapping
 *
 * This file contains the centralized mapping of Stripe price IDs to internal plan names.
 * Only used on the server side for security.
 */

import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

// Plan types supported by the application
export type PlanType = 'standard';

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
    {
      priceId: env.STRIPE_PRICE_INTRO_MONTHLY || '',
      plan: 'standard',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      description: 'Intro Monthly',
    },
    {
      priceId: env.STRIPE_PRICE_INTRO_YEARLY || '',
      plan: 'standard',
      amount: 5000,
      currency: 'usd',
      interval: 'year',
      description: 'Intro Yearly',
    },
    {
      priceId: env.STRIPE_PRICE_STANDARD_MONTHLY || '',
      plan: 'standard',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      description: 'Standard Monthly',
    },
    {
      priceId: env.STRIPE_PRICE_STANDARD_YEARLY || '',
      plan: 'standard',
      amount: 5000,
      currency: 'usd',
      interval: 'year',
      description: 'Standard Yearly',
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
 * Check if a user should have pro features based on their plan
 */
export function isProPlan(plan: string | null): boolean {
  return plan === 'standard';
}

/**
 * Check if a plan has advanced features (only full 'pro' plan)
 */
export function hasAdvancedFeatures(_plan: string | null): boolean {
  void _plan;
  return false;
}

/**
 * Get plan display name for UI
 */
export function getPlanDisplayName(plan: string | null): string {
  switch (plan) {
    case 'standard':
      return 'Standard';
    default:
      return 'Free';
  }
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

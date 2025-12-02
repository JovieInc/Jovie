/**
 * Stripe Configuration and Price-to-Plan Mapping
 *
 * This file contains the centralized mapping of Stripe price IDs to internal plan names.
 * Only used on the server side for security.
 */

import { env } from '@/lib/env';

const INTRO_MONTHLY_PRICE_ID =
  env.STRIPE_PRICE_INTRO_MONTHLY || process.env.STRIPE_PRICE_PRO || '';

// Plan types supported by the application
export type PlanType = 'pro_lite' | 'pro';

// Price mapping interface
interface PriceMapping {
  priceId: string;
  plan: PlanType;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  isIntroductory: boolean;
  description: string;
}

// Current active price mappings
// These will be updated when switching from intro to standard pricing
export const PRICE_MAPPINGS: Record<string, PriceMapping> = {
  // Introductory pricing (currently active)
  [INTRO_MONTHLY_PRICE_ID]: {
    priceId: INTRO_MONTHLY_PRICE_ID,
    plan: 'pro_lite',
    amount: 500, // $5.00 in cents
    currency: 'usd',
    interval: 'month',
    isIntroductory: true,
    description: 'Pro Lite Monthly (Intro)',
  },
  [env.STRIPE_PRICE_INTRO_YEARLY || '']: {
    priceId: env.STRIPE_PRICE_INTRO_YEARLY || '',
    plan: 'pro_lite',
    amount: 2500, // $25.00 in cents
    currency: 'usd',
    interval: 'year',
    isIntroductory: true,
    description: 'Pro Lite Yearly (Intro)',
  },

  // Standard pricing (inactive, for future cutover)
  [env.STRIPE_PRICE_STANDARD_MONTHLY || '']: {
    priceId: env.STRIPE_PRICE_STANDARD_MONTHLY || '',
    plan: 'pro',
    amount: 1200, // $12.00 in cents
    currency: 'usd',
    interval: 'month',
    isIntroductory: false,
    description: 'Pro Monthly (Standard)',
  },
  [env.STRIPE_PRICE_STANDARD_YEARLY || '']: {
    priceId: env.STRIPE_PRICE_STANDARD_YEARLY || '',
    plan: 'pro',
    amount: 4800, // $48.00 in cents
    currency: 'usd',
    interval: 'year',
    isIntroductory: false,
    description: 'Pro Yearly (Standard)',
  },
};

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
 * Returns only introductory prices for now
 */
export function getActivePriceIds(): string[] {
  return Object.values(PRICE_MAPPINGS)
    .filter(mapping => mapping.isIntroductory && mapping.priceId)
    .map(mapping => mapping.priceId);
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
  return Object.values(PRICE_MAPPINGS)
    .filter(mapping => mapping.isIntroductory && mapping.priceId)
    .sort((a, b) => a.amount - b.amount); // Sort by price, lowest first
}

/**
 * Check if a user should have pro features based on their plan
 */
export function isProPlan(plan: string | null): boolean {
  return plan === 'pro_lite' || plan === 'pro';
}

/**
 * Check if a plan has advanced features (only full 'pro' plan)
 */
export function hasAdvancedFeatures(plan: string | null): boolean {
  return plan === 'pro';
}

/**
 * Get plan display name for UI
 */
export function getPlanDisplayName(plan: string | null): string {
  switch (plan) {
    case 'pro_lite':
      return 'Pro (Intro Pricing)';
    case 'pro':
      return 'Pro';
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
  const requiredVars = [
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const missingVars = requiredVars.filter(
    varName => !env[varName as keyof typeof env]
  );

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

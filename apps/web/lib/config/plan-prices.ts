/**
 * Canonical plan prices in USD (dollars).
 *
 * This is the SINGLE SOURCE OF TRUTH for all pricing across the app.
 * Both server (pricing.ts) and client (registry.ts) derive from this.
 *
 * NO server-only imports — this file must be client-importable.
 */

import { SUPPORT_EMAIL } from '@/constants/domains';

/** Current public offer. Legacy annual/Max prices below only resolve existing plans. */
export const ARTIST_VISIBILITY_OFFER = {
  free: {
    displayName: 'Free',
    profileLifetime: 'forever',
    downgrade: 'branded',
    audienceCapture: true,
  },
  pro: {
    displayName: 'Pro',
    monthlyUsd: 199,
    currency: 'usd',
    interval: 'month',
    outcomes: [
      'Continuous visibility monitoring',
      'Prioritized opportunities',
      'Agentic fixes',
    ],
  },
  enterprise: {
    displayName: 'Enterprise',
    cta: 'Contact sales',
    href: `mailto:${SUPPORT_EMAIL}`,
    checkout: false,
  },
  fanSends: {
    billing: 'separately_metered',
    currency: 'usd',
    freeTrialEmailAllowance: 50,
    recurringAllowance: null,
    defaultSpendCapUsd: 0,
    paidSendingEnabled: false,
  },
} as const;

export const PLAN_PRICES = {
  pro: {
    monthly: ARTIST_VISIBILITY_OFFER.pro.monthlyUsd,
    yearly: 375,
  },
  max: {
    monthly: 149,
    yearly: 1430,
  },
} as const;

export type PaidPlanTier = keyof typeof PLAN_PRICES;

/** Convert a dollar amount to cents for Stripe. Uses Math.round for float safety. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

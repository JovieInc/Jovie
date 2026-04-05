/**
 * Canonical plan prices in USD (dollars).
 *
 * This is the SINGLE SOURCE OF TRUTH for all pricing across the app.
 * Both server (pricing.ts) and client (registry.ts) derive from this.
 *
 * NO server-only imports — this file must be client-importable.
 */

export const PLAN_PRICES = {
  pro: {
    monthly: 20,
    yearly: 192,
  },
  max: {
    monthly: 200,
    yearly: 1920,
  },
} as const;

export type PaidPlanTier = keyof typeof PLAN_PRICES;

/** Convert a dollar amount to cents for Stripe. Uses Math.round for float safety. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

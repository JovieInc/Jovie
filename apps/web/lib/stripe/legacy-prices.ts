/**
 * Retired Stripe price IDs still held by active subscriptions.
 *
 * These prices are NOT offered at checkout. They exist only so webhook
 * handlers and plan-change lookups can resolve legacy subscriptions to the
 * correct entitlement tier per ENTITLEMENT_REGISTRY (founding -> pro).
 */

/** Entitlement tier for legacy prices (founding maps to pro per ENTITLEMENT_REGISTRY). */
export type LegacyEntitlementPlan = 'pro' | 'max';

export interface LegacyPriceDefinition {
  readonly priceId: string;
  /** Entitlement plan — founding subscribers receive pro entitlements. */
  readonly plan: LegacyEntitlementPlan;
  readonly amount: number;
  readonly interval: 'month' | 'year';
  readonly description: string;
}

/**
 * Known retired price IDs that may still appear on live subscriptions.
 * Prefer STRIPE_PRICE_FOUNDING_MONTHLY env when set; these are fallbacks.
 */
export const HARDCODED_LEGACY_PRICES: readonly LegacyPriceDefinition[] = [
  {
    // JOV-1769: founding member monthly — removed from checkout Mar 2026
    priceId: 'price_1T1DegAAI1NrDqJSTtjAwLBi',
    plan: 'pro',
    amount: 1200,
    interval: 'month',
    description: 'Founding Member (legacy)',
  },
  {
    // Pre-rebrand Standard monthly (Dec 2025 .env.example)
    priceId: 'price_1Sde6QRSmm9B6YB5F8V7suAG',
    plan: 'pro',
    amount: 2000,
    interval: 'month',
    description: 'Standard Monthly (legacy)',
  },
  {
    // Pre-rebrand Standard yearly (Dec 2025 .env.example)
    priceId: 'price_1Sde6iRSmm9B6YB5PSxXPVdy',
    plan: 'pro',
    amount: 19200,
    interval: 'year',
    description: 'Standard Yearly (legacy)',
  },
] as const;

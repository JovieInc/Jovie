/**
 * Canonical plan definitions for Jovie.
 *
 * This file is the UI-friendly re-export of plan data derived from the entitlement
 * registry and plan-prices canonical sources. It is the single source of truth for
 * any UI that needs to display plan names, prices, or descriptions.
 *
 * Import rules:
 * - Server components, API routes, gating logic → use `@/lib/entitlements/registry`
 * - Marketing pages, pricing UI, onboarding copy → import from here
 * - Stripe/billing amount → use `@/lib/config/plan-prices` (this file re-exports it)
 *
 * Hard rules:
 * - Never expose "waitlist" as public copy; approved request-access CTAs may
 *   route to the waitlist endpoint
 * - Plan IDs here must match `PlanId` in `@/lib/entitlements/registry`
 * - Public prices and CTAs must come from `@/lib/billing/offer-truth`
 */

import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

export { PLAN_PRICES } from '@/lib/config/plan-prices';

const FREE_CLAIM = getPublicPriceClaim('free');
const PRO_CLAIM = getPublicPriceClaim('pro');
const MAX_CLAIM = getPublicPriceClaim('max');

export type CanonicalPlanId = 'free' | 'pro' | 'max';

export interface CanonicalPlan {
  /** Internal plan ID — matches `PlanId` in entitlement registry */
  readonly id: CanonicalPlanId;
  /** Display name for UI (e.g. "Pro") */
  readonly displayName: string;
  /** One-line tagline for marketing surfaces */
  readonly tagline: string;
  /** Monthly price in USD dollars. Null means free. */
  readonly monthlyPriceUsd: number | null;
  /** Yearly price in USD dollars. Null means free or not applicable. */
  readonly yearlyPriceUsd: number | null;
  /** Human-readable monthly price string (e.g. "$39") */
  readonly monthlyPriceLabel: string;
  /** Bullet feature list for pricing cards */
  readonly features: readonly string[];
  /** Primary CTA label for plan selection */
  readonly ctaLabel: string;
  /** Signup URL with plan pre-selected as a query param */
  readonly signupHref: string;
}

export const CANONICAL_PLANS: readonly CanonicalPlan[] = [
  {
    id: 'free',
    displayName: ENTITLEMENT_REGISTRY.free.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.free.marketing.tagline,
    monthlyPriceUsd: FREE_CLAIM.priceUsd,
    yearlyPriceUsd: FREE_CLAIM.annualPriceUsd,
    monthlyPriceLabel: FREE_CLAIM.priceLabel,
    features: ENTITLEMENT_REGISTRY.free.marketing.features,
    ctaLabel: FREE_CLAIM.ctaLabel,
    signupHref: FREE_CLAIM.ctaHref,
  },
  {
    id: 'pro',
    displayName: ENTITLEMENT_REGISTRY.pro.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.pro.marketing.tagline,
    monthlyPriceUsd: PRO_CLAIM.priceUsd,
    yearlyPriceUsd: PRO_CLAIM.annualPriceUsd,
    monthlyPriceLabel: PRO_CLAIM.priceLabel,
    features: ENTITLEMENT_REGISTRY.pro.marketing.features,
    ctaLabel: PRO_CLAIM.ctaLabel,
    signupHref: PRO_CLAIM.ctaHref,
  },
  {
    id: 'max',
    displayName: ENTITLEMENT_REGISTRY.max.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.max.marketing.tagline,
    monthlyPriceUsd: MAX_CLAIM.priceUsd,
    yearlyPriceUsd: MAX_CLAIM.annualPriceUsd,
    monthlyPriceLabel: MAX_CLAIM.priceLabel,
    features: ENTITLEMENT_REGISTRY.max.marketing.features,
    ctaLabel: MAX_CLAIM.ctaLabel,
    signupHref: MAX_CLAIM.ctaHref,
  },
] as const;

/** Look up a canonical plan by ID. Returns undefined if not found. */
export function getCanonicalPlan(id: string): CanonicalPlan | undefined {
  return CANONICAL_PLANS.find(plan => plan.id === id);
}

/** All canonical plan IDs in tier order. */
export const CANONICAL_PLAN_IDS: readonly CanonicalPlanId[] =
  CANONICAL_PLANS.map(plan => plan.id);

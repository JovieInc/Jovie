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
 * - Never mention "waitlist" in any plan label, CTA, or description
 * - Plan IDs here must match `PlanId` in `@/lib/entitlements/registry`
 * - Prices must come from `PLAN_PRICES` in `@/lib/config/plan-prices`
 */

import { APP_ROUTES } from '@/constants/routes';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

export { PLAN_PRICES } from '@/lib/config/plan-prices';

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
    monthlyPriceUsd: 0,
    yearlyPriceUsd: null,
    monthlyPriceLabel: '$0',
    features: ENTITLEMENT_REGISTRY.free.marketing.features,
    ctaLabel: 'Claim your profile',
    signupHref: `${APP_ROUTES.SIGNUP}?plan=free`,
  },
  {
    id: 'pro',
    displayName: ENTITLEMENT_REGISTRY.pro.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.pro.marketing.tagline,
    monthlyPriceUsd: PLAN_PRICES.pro.monthly,
    yearlyPriceUsd: PLAN_PRICES.pro.yearly,
    monthlyPriceLabel: `$${PLAN_PRICES.pro.monthly}`,
    features: ENTITLEMENT_REGISTRY.pro.marketing.features,
    ctaLabel: 'Start Free Trial',
    signupHref: `${APP_ROUTES.SIGNUP}?plan=pro`,
  },
  {
    id: 'max',
    displayName: ENTITLEMENT_REGISTRY.max.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.max.marketing.tagline,
    monthlyPriceUsd: PLAN_PRICES.max.monthly,
    yearlyPriceUsd: PLAN_PRICES.max.yearly,
    monthlyPriceLabel: `$${PLAN_PRICES.max.monthly}`,
    features: ENTITLEMENT_REGISTRY.max.marketing.features,
    ctaLabel: 'Start Free Trial',
    signupHref: `${APP_ROUTES.SIGNUP}?plan=max`,
  },
] as const;

/** Look up a canonical plan by ID. Returns undefined if not found. */
export function getCanonicalPlan(id: string): CanonicalPlan | undefined {
  return CANONICAL_PLANS.find(plan => plan.id === id);
}

/** All canonical plan IDs in tier order. */
export const CANONICAL_PLAN_IDS: readonly CanonicalPlanId[] =
  CANONICAL_PLANS.map(plan => plan.id);

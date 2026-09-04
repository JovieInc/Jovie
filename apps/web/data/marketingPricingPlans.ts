import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

/**
 * Canonical plan IDs for the marketing pricing page.
 *
 * These MUST match the canonical PlanId values in
 * apps/web/lib/entitlements/registry.ts (free / pro / max).
 * Do not add plan IDs here that don't exist in the entitlement registry.
 */
export const MARKETING_PRICING_PLAN_IDS = ['free', 'pro', 'max'] as const;

export type MarketingPricingPlanId =
  (typeof MARKETING_PRICING_PLAN_IDS)[number];

const visiblePlanIds = (process.env.NEXT_PUBLIC_MARKETING_VISIBLE_PLANS ?? '')
  .split(',')
  .map(plan => plan.trim())
  .filter((plan): plan is MarketingPricingPlanId =>
    (MARKETING_PRICING_PLAN_IDS as readonly string[]).includes(plan)
  );
const VISIBLE_PLAN_IDS = new Set<MarketingPricingPlanId>(
  visiblePlanIds.length > 0 ? visiblePlanIds : MARKETING_PRICING_PLAN_IDS
);

export interface MarketingPricingPlan {
  readonly id: MarketingPricingPlanId;
  readonly name: string;
  readonly price: string;
  readonly cadence?: string;
  readonly badge: string;
  readonly body: string;
  readonly features: readonly string[];
  readonly accent: 'cyan' | 'blue' | 'pink' | 'violet';
  readonly ctaLabel: string;
  readonly ctaHref: string;
}

const PLAN_PRESENTATION = {
  free: {
    badge: 'Free forever',
    accent: 'cyan',
    ctaLabel: 'Claim your profile',
  },
  pro: { badge: 'Recommended', accent: 'blue', ctaLabel: 'Choose Pro' },
  max: { badge: 'Early access', accent: 'violet', ctaLabel: 'Choose Max' },
} as const;

export const MARKETING_PRICING_PLANS: readonly MarketingPricingPlan[] =
  MARKETING_PRICING_PLAN_IDS.map(id => {
    const entitlement = ENTITLEMENT_REGISTRY[id];
    const presentation = PLAN_PRESENTATION[id];
    return {
      id,
      name: entitlement.marketing.displayName,
      price: entitlement.marketing.price
        ? `$${entitlement.marketing.price.monthly}`
        : '$0',
      ...(entitlement.marketing.price ? { cadence: '/mo' } : {}),
      badge: presentation.badge,
      body: entitlement.marketing.tagline,
      // Cards stay scannable; the canonical comparison immediately below
      // carries the full entitlement matrix.
      features: entitlement.marketing.features.slice(0, 10),
      accent: presentation.accent,
      ctaLabel: presentation.ctaLabel,
      ctaHref: getMarketingPlanHref(id),
    };
  });

export function getMarketingPlanHref(planId: MarketingPricingPlanId): string {
  return `${APP_ROUTES.SIGNUP}?plan=${planId}`;
}

export function isMarketingPlanActive(
  _planId: MarketingPricingPlanId
): boolean {
  return true;
}

export function isMarketingPlanVisible(
  planId: MarketingPricingPlanId
): boolean {
  return VISIBLE_PLAN_IDS.has(planId);
}

export function getVisibleMarketingPricingPlans(): readonly MarketingPricingPlan[] {
  return MARKETING_PRICING_PLANS.filter(plan =>
    isMarketingPlanVisible(plan.id)
  );
}

export function getMarketingPlanCtaLabel(plan: MarketingPricingPlan): string {
  return plan.ctaLabel;
}

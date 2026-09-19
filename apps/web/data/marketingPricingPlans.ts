import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

/**
 * Canonical plan IDs for the marketing pricing page.
 *
 * These are the public acquisition plans. Runtime entitlement IDs remain
 * canonical in apps/web/lib/entitlements/registry.ts.
 */
export const MARKETING_PRICING_PLAN_IDS = [
  'free',
  'pro',
  'enterprise',
] as const;

export type MarketingPricingPlanId =
  (typeof MARKETING_PRICING_PLAN_IDS)[number];

const visiblePlanIds = (process.env.NEXT_PUBLIC_MARKETING_VISIBLE_PLANS ?? '')
  .split(',')
  .map(plan => {
    const normalizedPlan = plan.trim();
    return normalizedPlan === 'max' ? 'enterprise' : normalizedPlan;
  })
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

const FREE_CLAIM = getPublicPriceClaim('free');
const PRO_CLAIM = getPublicPriceClaim('pro');
const ENTERPRISE_CLAIM = getPublicPriceClaim('enterprise');

export const MARKETING_PRICING_PLANS: readonly MarketingPricingPlan[] = [
  {
    id: 'free',
    name: FREE_CLAIM.displayName,
    price: FREE_CLAIM.priceLabel,
    cadence: FREE_CLAIM.cadence ?? undefined,
    badge: FREE_CLAIM.badge,
    body: FREE_CLAIM.note,
    features: ['Public artist profile and audience capture'],
    accent: 'cyan',
    ctaLabel: FREE_CLAIM.ctaLabel,
    ctaHref: FREE_CLAIM.ctaHref,
  },
  {
    id: 'pro',
    name: PRO_CLAIM.displayName,
    price: PRO_CLAIM.priceLabel,
    cadence: PRO_CLAIM.cadence ?? undefined,
    badge: PRO_CLAIM.badge,
    body: PRO_CLAIM.note,
    features: ['Public artist profile and audience capture'],
    accent: 'blue',
    ctaLabel: PRO_CLAIM.ctaLabel,
    ctaHref: PRO_CLAIM.ctaHref,
  },
  {
    id: 'enterprise',
    name: ENTERPRISE_CLAIM.displayName,
    price: ENTERPRISE_CLAIM.priceLabel,
    cadence: ENTERPRISE_CLAIM.cadence ?? undefined,
    badge: ENTERPRISE_CLAIM.badge,
    body: ENTERPRISE_CLAIM.note,
    features: [],
    accent: 'violet',
    ctaLabel: ENTERPRISE_CLAIM.ctaLabel,
    ctaHref: ENTERPRISE_CLAIM.ctaHref,
  },
] as const;

export function getMarketingPlanHref(planId: MarketingPricingPlanId): string {
  return getPublicPriceClaim(planId).ctaHref;
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
  return getPublicPriceClaim(plan.id).ctaLabel;
}

import {
  type BillingInterval,
  formatUsdAmount,
  getMaxOfferBadge,
  getPlanCtaLabel,
  getPlanOfferNote,
  getPlanSignupHref,
  type PublicOfferPlan,
} from '@/lib/billing/offer-truth';
import { PLAN_PRICES } from '@/lib/config/plan-prices';

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
  readonly offerNote: string;
}

export const MARKETING_PRICING_PLANS: readonly MarketingPricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    badge: 'Free forever',
    body: 'Your artist profile, smart links, and public fan path stay free.',
    features: [
      'Artist profile',
      'Smart release links',
      'Listen buttons by platform',
      'Basic audience signal',
      'Up to 100 contacts',
      'Manual release creation',
    ],
    accent: 'cyan',
    ctaLabel: getPlanCtaLabel('free'),
    ctaHref: getPlanSignupHref('free'),
    offerNote: getPlanOfferNote('free'),
  },
  {
    id: 'pro',
    name: 'Pro',
    price: formatUsdAmount(PLAN_PRICES.pro.monthly),
    cadence: '/mo',
    badge: 'Recommended',
    body: 'Fan notifications, presaves, and deeper release analytics.',
    features: [
      'Everything in Free',
      'Release notifications to fans',
      'Pre-save campaigns',
      'Pre-release countdown pages',
      'Extended analytics (180 days)',
      'Unlimited contacts',
      'Contact export',
      'Tips & payments',
      'Verified badge',
      'AI assistant (70 messages/week)',
    ],
    accent: 'blue',
    ctaLabel: getPlanCtaLabel('pro'),
    ctaHref: getPlanSignupHref('pro'),
    offerNote: getPlanOfferNote('pro'),
  },
  {
    id: 'max',
    name: 'Max',
    price: formatUsdAmount(PLAN_PRICES.max.monthly),
    cadence: '/mo',
    badge: getMaxOfferBadge(),
    body: 'Your entire release operation, automated end to end.',
    features: [
      'Everything in Pro',
      'Release plan generation',
      'Metadata submission agent',
      'Unlimited analytics',
      'Email campaigns',
      'API access',
      'AI assistant (250 messages/week)',
    ],
    accent: 'violet',
    ctaLabel: getPlanCtaLabel('max'),
    ctaHref: getPlanSignupHref('max'),
    offerNote: getPlanOfferNote('max'),
  },
] as const;

export function getMarketingPlanHref(
  planId: MarketingPricingPlanId,
  interval: BillingInterval = 'month'
): string {
  return getPlanSignupHref(planId, interval);
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
  return getPlanCtaLabel(plan.id);
}

export function resolveMarketingPlanId(
  planId: string | null | undefined
): PublicOfferPlan | null {
  if (planId === 'free' || planId === 'pro' || planId === 'max') {
    return planId;
  }
  return null;
}

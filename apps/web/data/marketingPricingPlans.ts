import { APP_ROUTES } from '@/constants/routes';
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
    ctaLabel: 'Claim your profile',
    ctaHref: `${APP_ROUTES.SIGNUP}?plan=free`,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: `$${PLAN_PRICES.pro.monthly}`,
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
      'AI assistant (100 msgs/day)',
    ],
    accent: 'blue',
    ctaLabel: 'Start Free Trial',
    ctaHref: `${APP_ROUTES.SIGNUP}?plan=pro`,
  },
  {
    id: 'max',
    name: 'Max',
    price: `$${PLAN_PRICES.max.monthly}`,
    cadence: '/mo',
    badge: 'Full stack',
    body: 'Your entire release operation, automated end to end.',
    features: [
      'Everything in Pro',
      'Release plan generation',
      'Metadata submission agent',
      'Unlimited analytics',
      'Email campaigns',
      'Fan subscriptions',
      'API access',
      'Team management',
      'White-label / custom domain',
      'AI assistant (500 msgs/day)',
    ],
    accent: 'violet',
    ctaLabel: 'Start Free Trial',
    ctaHref: `${APP_ROUTES.SIGNUP}?plan=max`,
  },
] as const;

export function getMarketingPlanHref(planId: MarketingPricingPlanId): string {
  return `${APP_ROUTES.SIGNUP}?plan=${planId}`;
}

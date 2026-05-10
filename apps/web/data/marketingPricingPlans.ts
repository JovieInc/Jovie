import { APP_ROUTES } from '@/constants/routes';

export const MARKETING_PRICING_PLAN_IDS = [
  'free',
  'pro',
  'team',
  'enterprise',
] as const;

export type MarketingPricingPlanId =
  (typeof MARKETING_PRICING_PLAN_IDS)[number];

const activePlanIds = (process.env.NEXT_PUBLIC_MARKETING_ACTIVE_PLANS ?? 'free')
  .split(',')
  .map(plan => plan.trim())
  .filter((plan): plan is MarketingPricingPlanId =>
    (MARKETING_PRICING_PLAN_IDS as readonly string[]).includes(plan)
  );
const ACTIVE_PLAN_IDS = new Set<MarketingPricingPlanId>(
  activePlanIds.length > 0 ? activePlanIds : ['free']
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
  readonly activeCtaLabel: string;
  readonly waitlistCtaLabel: string;
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
    ],
    accent: 'cyan',
    activeCtaLabel: 'Claim your profile',
    waitlistCtaLabel: 'Claim your profile',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$39',
    cadence: '/mo',
    badge: 'Recommended',
    body: 'Fan notifications, presaves, release plans, and launch automation.',
    features: [
      'Release plan generation',
      'Presaves and countdowns',
      'Automatic fan notifications',
      'Deeper release analytics',
    ],
    accent: 'blue',
    activeCtaLabel: 'Start Free Trial',
    waitlistCtaLabel: 'Request Access',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$99',
    cadence: '/mo',
    badge: 'Teams',
    body: 'A shared release workspace for managers, artists, and collaborators.',
    features: [
      'Shared team workspace',
      'Assignments and approvals',
      'Catalog release views',
      'Role-aware collaboration',
    ],
    accent: 'pink',
    activeCtaLabel: 'Start Team Trial',
    waitlistCtaLabel: 'Request Access',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    badge: 'Labels',
    body: 'Team accounts, label workflows, onboarding, and priority support.',
    features: [
      'Team account setup',
      'Label and management workflows',
      'Priority onboarding',
      'Custom launch support',
    ],
    accent: 'violet',
    activeCtaLabel: 'Contact Sales',
    waitlistCtaLabel: 'Contact Sales',
  },
] as const;

export function isMarketingPlanActive(planId: MarketingPricingPlanId): boolean {
  return ACTIVE_PLAN_IDS.has(planId);
}

export function getMarketingPlanHref(planId: MarketingPricingPlanId): string {
  return `${APP_ROUTES.SIGNUP}?plan=${planId}`;
}

export function getMarketingPlanCtaLabel(plan: MarketingPricingPlan): string {
  return isMarketingPlanActive(plan.id)
    ? plan.activeCtaLabel
    : plan.waitlistCtaLabel;
}

import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import {
  ARTIST_VISIBILITY_OFFER,
  FREE_PROFILE_TRUTH,
  formatUsdAmount,
  PRO_TRIAL_DURATION_DAYS,
  PRO_TRIAL_TRUTH,
} from '@/lib/billing/offer-truth';

/**
 * Public marketing offer copy (JOV-6231).
 * Billing/checkout contract remains PR #17743 (JOV-6218).
 */
/** Public acquisition offers are distinct from legacy subscriber entitlement IDs. */
export const MARKETING_PRICING_PLAN_IDS = [
  'free',
  'pro',
  'enterprise',
] as const;
export type MarketingPricingPlanId =
  (typeof MARKETING_PRICING_PLAN_IDS)[number];

/** JOV-6223: certification is required before promoting planned capabilities. */
export const ARTIST_VISIBILITY_AVAILABILITY = {
  status: 'limited_access',
  label: 'Limited access',
  note: `${PRO_TRIAL_TRUTH} Visibility monitoring, prioritized opportunities, and approved fixes are not yet generally available.`,
} as const;

export const ENTERPRISE_CONTACT_HREF = ARTIST_VISIBILITY_OFFER.enterprise.href;

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
  readonly ctaHref: string | null;
  readonly offerNote: string;
}

export const MARKETING_PRICING_PLANS: readonly MarketingPricingPlan[] = [
  {
    id: 'free',
    name: ARTIST_VISIBILITY_OFFER.free.displayName,
    price: formatUsdAmount(0),
    badge: 'Free forever',
    body: 'Your artist profile and audience capture stay free.',
    features: [
      'Artist profile',
      'Audience capture',
      'Jovie branding after downgrade',
    ],
    accent: 'cyan',
    ctaLabel: 'Request access',
    ctaHref: PUBLIC_WAITLIST_URL,
    offerNote: FREE_PROFILE_TRUTH,
  },
  {
    id: 'pro',
    name: ARTIST_VISIBILITY_OFFER.pro.displayName,
    price: formatUsdAmount(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
    cadence: '/mo',
    badge: ARTIST_VISIBILITY_AVAILABILITY.label,
    body: 'The planned Artist Visibility offer: monitor, surface opportunities, approve, and fix.',
    features: ARTIST_VISIBILITY_OFFER.pro.outcomes.map(
      outcome => `${outcome} — planned`
    ),
    accent: 'blue',
    ctaLabel: 'Request access',
    ctaHref: PUBLIC_WAITLIST_URL,
    offerNote: ARTIST_VISIBILITY_AVAILABILITY.note,
  },
  {
    id: 'enterprise',
    name: ARTIST_VISIBILITY_OFFER.enterprise.displayName,
    price: 'Custom',
    badge: 'For teams',
    body: 'Discuss your artist roster and team requirements.',
    features: ['Scope and pricing by agreement'],
    accent: 'violet',
    ctaLabel: ARTIST_VISIBILITY_OFFER.enterprise.cta,
    ctaHref: ENTERPRISE_CONTACT_HREF,
    offerNote: 'No self-service Enterprise checkout.',
  },
];

export function getMarketingPlanHref(
  planId: MarketingPricingPlanId
): string | null {
  return (
    MARKETING_PRICING_PLANS.find(plan => plan.id === planId)?.ctaHref ?? null
  );
}

export function isMarketingPlanActive(
  _planId: MarketingPricingPlanId
): boolean {
  // Access requests are enabled; self-service purchase is not certified.
  return false;
}

export function isMarketingPlanVisible(
  planId: MarketingPricingPlanId
): boolean {
  return MARKETING_PRICING_PLAN_IDS.includes(planId);
}

export function getVisibleMarketingPricingPlans(): readonly MarketingPricingPlan[] {
  return MARKETING_PRICING_PLANS;
}

export function getMarketingPlanCtaLabel(plan: MarketingPricingPlan): string {
  return plan.ctaLabel;
}

export const ARTIST_VISIBILITY_COMPARISON = [
  {
    category: 'Offer',
    features: [
      {
        name: 'Price',
        free: 'Free forever',
        pro: `${formatUsdAmount(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)}/month`,
        enterprise: 'By agreement',
      },
      {
        name: 'Access',
        free: 'Request access',
        pro: ARTIST_VISIBILITY_AVAILABILITY.label,
        enterprise: 'Contact sales',
      },
      {
        name: 'Artist profile',
        free: 'Included',
        pro: 'Included',
        enterprise: 'By agreement',
      },
      {
        name: 'Audience capture',
        free: 'Included',
        pro: 'Included',
        enterprise: 'By agreement',
      },
    ],
  },
  {
    category: 'Visibility',
    features: ARTIST_VISIBILITY_OFFER.pro.outcomes.map(name => ({
      name,
      free: 'Not included',
      pro: 'Planned',
      enterprise: 'By agreement',
    })),
  },
  {
    category: 'Fan sends',
    features: [
      {
        name: 'Paid sending',
        free: 'Unavailable',
        pro: 'Separately metered; currently unavailable',
        enterprise: 'By agreement',
      },
    ],
  },
] as const;

export const FAN_SEND_OFFER_NOTE = `Fan sends are separately metered. The trial allowance is ${ARTIST_VISIBILITY_OFFER.fanSends.freeTrialEmailAllowance} emails, not a recurring allowance. Paid sending is currently unavailable.`;

export const PUBLIC_PRICING_DESCRIPTION = `Free artist profiles, a ${formatUsdAmount(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)} monthly Pro offer with a ${PRO_TRIAL_DURATION_DAYS}-day no-card trial, and Enterprise contact sales.`;
export const PRICING_REQUEST_ACCESS_COPY = `Request access to Artist Visibility. ${PRO_TRIAL_TRUTH} Monitoring and approved fixes are not yet generally available.`;

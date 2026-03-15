/**
 * Entitlement Registry — Single source of truth for plan features, limits, and marketing.
 *
 * All consumers (server.ts, usePlanGate, pricing page, rate-limit config) derive from this.
 * NO `import 'server-only'` — this must be client-importable.
 */

// ---------------------------------------------------------------------------
// Plan IDs
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'founding' | 'pro' | 'growth';

const PLAN_IDS: readonly PlanId[] = [
  'free',
  'founding',
  'pro',
  'growth',
] as const;

// ---------------------------------------------------------------------------
// Entitlement key unions
// ---------------------------------------------------------------------------

export type BooleanEntitlement =
  | 'canRemoveBranding'
  | 'canExportContacts'
  | 'canAccessAdvancedAnalytics'
  | 'canFilterSelfFromAnalytics'
  | 'canAccessAdPixels'
  | 'canBeVerified'
  | 'aiCanUseTools'
  | 'canCreateManualReleases'
  | 'canAccessFutureReleases'
  | 'canSendNotifications'
  | 'canEditSmartLinks';

export type NumericEntitlement =
  | 'analyticsRetentionDays'
  | 'contactsLimit'
  | 'smartLinksLimit'
  | 'aiDailyMessageLimit';

// ---------------------------------------------------------------------------
// Plan entitlements shape
// ---------------------------------------------------------------------------

export interface PlanEntitlements {
  booleans: Record<BooleanEntitlement, boolean>;
  limits: {
    analyticsRetentionDays: number;
    contactsLimit: number | null;
    smartLinksLimit: number | null;
    aiDailyMessageLimit: number;
  };
  marketing: {
    displayName: string;
    tagline: string;
    features: readonly string[];
    price: { monthly: number; yearly: number | null } | null;
  };
}

// ---------------------------------------------------------------------------
// Shared entitlement blocks (founding and pro share identical capabilities)
// ---------------------------------------------------------------------------

const PRO_BOOLEANS: Record<BooleanEntitlement, boolean> = {
  canRemoveBranding: true,
  canExportContacts: true,
  canAccessAdvancedAnalytics: true,
  canFilterSelfFromAnalytics: true,
  canAccessAdPixels: true,
  canBeVerified: true,
  aiCanUseTools: true,
  canCreateManualReleases: true,
  canAccessFutureReleases: true,
  canSendNotifications: true,
  canEditSmartLinks: true,
};

const PRO_LIMITS: PlanEntitlements['limits'] = {
  analyticsRetentionDays: 90,
  contactsLimit: null,
  smartLinksLimit: null,
  aiDailyMessageLimit: 100,
};

const PRO_FEATURES: readonly string[] = [
  'All Free features +',
  'Pre-release & countdown pages',
  'Remove Jovie branding',
  'Extended analytics (90 days)',
  'Advanced analytics & geographic insights',
  'Filter your own visits',
  'AI-powered insights',
  'Unlimited contacts',
  'Contact export',
  'Fan CRM',
  'Tips & payments',
  'Earnings dashboard',
  'Ad pixel tracking',
  'Verified badge',
  'AI assistant (100 messages/day)',
  'Priority support',
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ENTITLEMENT_REGISTRY: Record<PlanId, PlanEntitlements> = {
  free: {
    booleans: {
      canRemoveBranding: false,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      canAccessAdPixels: false,
      canBeVerified: false,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessFutureReleases: false,
      canSendNotifications: true,
      canEditSmartLinks: true,
    },
    limits: {
      analyticsRetentionDays: 30,
      contactsLimit: 100,
      smartLinksLimit: null,
      aiDailyMessageLimit: 25,
    },
    marketing: {
      displayName: 'Free',
      tagline: 'Free for everyone',
      features: [
        'Unlimited smart links',
        'Auto-sync from Spotify',
        'Smart deep links',
        'Edit & customize smart links',
        'Release pages with listen links per DSP',
        'Short link redirects',
        'Vanity URLs',
        'Auto DSP detection & linking',
        'Manual release creation',
        'Public artist profile page',
        'Artist bio & social links',
        'Subscribe / follow page',
        'Contact page',
        'About page',
        'Tour dates (Bandsintown)',
        'Release notifications',
        'Click & visit tracking',
        'Basic analytics (30 days)',
        'Audience intelligence',
        'Up to 100 contacts',
        'AI assistant (25 msgs/day)',
      ],
      price: null,
    },
  },
  founding: {
    booleans: { ...PRO_BOOLEANS },
    limits: { ...PRO_LIMITS },
    marketing: {
      displayName: 'Founding Member',
      tagline: 'Early supporter pricing, locked in for life',
      features: PRO_FEATURES,
      price: { monthly: 12, yearly: null },
    },
  },
  pro: {
    booleans: { ...PRO_BOOLEANS },
    limits: { ...PRO_LIMITS },
    marketing: {
      displayName: 'Pro',
      tagline: 'For growing artists',
      features: PRO_FEATURES,
      price: { monthly: 39, yearly: 348 },
    },
  },
  growth: {
    booleans: {
      canRemoveBranding: true,
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      canAccessAdPixels: true,
      canBeVerified: true,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessFutureReleases: true,
      canSendNotifications: true,
      canEditSmartLinks: true,
    },
    limits: {
      analyticsRetentionDays: 365,
      contactsLimit: null,
      smartLinksLimit: null,
      aiDailyMessageLimit: 500,
    },
    marketing: {
      displayName: 'Growth',
      tagline: 'For serious artists',
      features: [
        'All Pro features +',
        'Full analytics (1 year)',
        'AI assistant (500 messages/day)',
        'A/B testing (Coming soon)',
        'Automated follow-ups (Coming soon)',
        'Catalog monitoring (Coming soon)',
      ],
      price: { monthly: 99, yearly: 948 },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Pricing comparison chart data
// ---------------------------------------------------------------------------

export interface ComparisonFeature {
  readonly name: string;
  readonly free: boolean | string;
  readonly pro: boolean | string;
  readonly growth: boolean | string;
  readonly comingSoon?: boolean;
}

export interface PricingCategory {
  readonly category: string;
  readonly features: readonly ComparisonFeature[];
}

export const PRICING_COMPARISON: readonly PricingCategory[] = [
  {
    category: 'Smart Links',
    features: [
      { name: 'Unlimited smart links', free: true, pro: true, growth: true },
      { name: 'Auto-sync from Spotify', free: true, pro: true, growth: true },
      {
        name: 'Smart deep links (native apps)',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Edit & customize smart links',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Release pages with listen links per DSP',
        free: true,
        pro: true,
        growth: true,
      },
      { name: 'Short link redirects', free: true, pro: true, growth: true },
      { name: 'Vanity URLs', free: true, pro: true, growth: true },
      {
        name: 'Auto DSP detection & linking',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Manual release creation',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Pre-release & countdown pages',
        free: false,
        pro: true,
        growth: true,
      },
    ],
  },
  {
    category: 'Artist Profile',
    features: [
      {
        name: 'Public artist profile page',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Artist bio & social links',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Subscribe / follow page',
        free: true,
        pro: true,
        growth: true,
      },
      { name: 'Contact page', free: true, pro: true, growth: true },
      { name: 'About page', free: true, pro: true, growth: true },
      {
        name: 'Tour dates (Bandsintown)',
        free: true,
        pro: true,
        growth: true,
      },
      { name: 'Verified badge', free: false, pro: true, growth: true },
      { name: 'Remove Jovie branding', free: false, pro: true, growth: true },
    ],
  },
  {
    category: 'Analytics',
    features: [
      {
        name: 'Click & visit tracking',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Data retention',
        free: '30 days',
        pro: '90 days',
        growth: '1 year',
      },
      {
        name: 'Audience intelligence (device, location, intent)',
        free: true,
        pro: true,
        growth: true,
      },
      {
        name: 'Advanced analytics & geographic insights',
        free: false,
        pro: true,
        growth: true,
      },
      {
        name: 'Filter your own visits',
        free: false,
        pro: true,
        growth: true,
      },
      { name: 'AI-powered insights', free: false, pro: true, growth: true },
      { name: 'Ad pixel tracking', free: false, pro: true, growth: true },
      {
        name: 'A/B testing',
        free: false,
        pro: false,
        growth: true,
        comingSoon: true,
      },
    ],
  },
  {
    category: 'Audience & Growth',
    features: [
      {
        name: 'Contact / subscriber capture',
        free: 'Up to 100',
        pro: 'Unlimited',
        growth: 'Unlimited',
      },
      {
        name: 'Release notifications (email to fans)',
        free: true,
        pro: true,
        growth: true,
      },
      { name: 'Contact export', free: false, pro: true, growth: true },
      { name: 'Fan CRM', free: false, pro: true, growth: true },
      {
        name: 'Automated follow-ups',
        free: false,
        pro: false,
        growth: true,
        comingSoon: true,
      },
      {
        name: 'Catalog monitoring',
        free: false,
        pro: false,
        growth: true,
        comingSoon: true,
      },
    ],
  },
  {
    category: 'Monetization',
    features: [
      { name: 'Tips & payments (Venmo)', free: false, pro: true, growth: true },
      { name: 'Earnings dashboard', free: false, pro: true, growth: true },
    ],
  },
  {
    category: 'AI Assistant',
    features: [
      {
        name: 'Daily messages',
        free: '25 / day',
        pro: '100 / day',
        growth: '500 / day',
      },
      { name: 'AI tool use', free: true, pro: true, growth: true },
    ],
  },
  {
    category: 'Support',
    features: [
      { name: 'Email support', free: true, pro: true, growth: true },
      { name: 'Priority support', free: false, pro: true, growth: true },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a raw plan string to a registry entry, defaulting to free. */
export function getEntitlements(
  plan: string | null | undefined
): PlanEntitlements {
  if (plan === 'growth') return ENTITLEMENT_REGISTRY.growth;
  if (plan === 'pro') return ENTITLEMENT_REGISTRY.pro;
  if (plan === 'founding') return ENTITLEMENT_REGISTRY.founding;
  return ENTITLEMENT_REGISTRY.free;
}

/** Check a single boolean entitlement for a plan. */
export function checkBoolean(
  plan: string | null | undefined,
  key: BooleanEntitlement
): boolean {
  return getEntitlements(plan).booleans[key];
}

/** Get a single numeric limit for a plan. */
export function getLimit(
  plan: string | null | undefined,
  key: NumericEntitlement
): number | null {
  return getEntitlements(plan).limits[key];
}

/** Whether the plan is pro or higher. */
export function isProPlan(plan: string | null | undefined): boolean {
  return plan === 'founding' || plan === 'pro' || plan === 'growth';
}

/** Whether the plan has growth-only advanced features. */
export function hasAdvancedFeatures(plan: string | null | undefined): boolean {
  return plan === 'growth';
}

/** Display name for UI. */
export function getPlanDisplayName(plan: string | null | undefined): string {
  return getEntitlements(plan).marketing.displayName;
}

/** All valid plan IDs. */
export function getAllPlanIds(): readonly PlanId[] {
  return PLAN_IDS;
}

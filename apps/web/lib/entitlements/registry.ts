/**
 * Entitlement Registry — Single source of truth for plan features, limits, and marketing.
 *
 * All consumers (server.ts, usePlanGate, pricing page, rate-limit config) derive from this.
 * NO `import 'server-only'` — this must be client-importable.
 */

// ---------------------------------------------------------------------------
// Plan IDs
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'pro' | 'max';

const PLAN_IDS: readonly PlanId[] = ['free', 'pro', 'max'] as const;

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
  | 'canEditSmartLinks'
  | 'canAccessInbox'
  | 'canAccessPreSave'
  | 'canAccessTipping'
  | 'canAccessUrlEncryption'
  | 'canAccessStripeConnect'
  | 'canAccessFanSubscriptions'
  | 'canAccessEmailCampaigns'
  | 'canAccessApiKeys'
  | 'canAccessTeamManagement'
  | 'canAccessWebhooks'
  | 'canAccessWhiteLabel'
  | 'canAccessAbTesting';

export type NumericEntitlement =
  | 'analyticsRetentionDays'
  | 'contactsLimit'
  | 'smartLinksLimit'
  | 'aiDailyMessageLimit'
  | 'aiPitchGenPerRelease';

// ---------------------------------------------------------------------------
// Plan entitlements shape
// ---------------------------------------------------------------------------

export interface PlanEntitlements {
  booleans: Record<BooleanEntitlement, boolean>;
  limits: {
    analyticsRetentionDays: number | null;
    contactsLimit: number | null;
    smartLinksLimit: number | null;
    aiDailyMessageLimit: number;
    aiPitchGenPerRelease: number | null;
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
  canAccessInbox: true,
  canAccessPreSave: true,
  canAccessTipping: true,
  canAccessUrlEncryption: true,
  canAccessStripeConnect: false,
  canAccessFanSubscriptions: false,
  canAccessEmailCampaigns: false,
  canAccessApiKeys: false,
  canAccessTeamManagement: false,
  canAccessWebhooks: false,
  canAccessWhiteLabel: false,
  canAccessAbTesting: false,
};

const PRO_LIMITS: PlanEntitlements['limits'] = {
  analyticsRetentionDays: 180,
  contactsLimit: 5000,
  smartLinksLimit: null,
  aiDailyMessageLimit: 100,
  aiPitchGenPerRelease: null,
};

const PRO_FEATURES: readonly string[] = [
  'All Free features +',
  'Pre-save campaigns',
  'Pre-release & countdown pages',
  'Release notifications',
  'Remove Jovie branding',
  'Extended analytics (180 days)',
  'Advanced analytics & geographic insights',
  'Filter your own visits',
  'AI-powered insights',
  'Up to 5,000 contacts',
  'Contact export',
  'Fan CRM',
  'Tips & payments',
  'Earnings dashboard',
  'URL encryption',
  'Ad pixel tracking',
  'Verified badge',
  'AI assistant (100 messages/day)',
  'Unlimited AI pitch generation',
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
      canSendNotifications: false,
      canEditSmartLinks: true,
      canAccessInbox: false,
      canAccessPreSave: false,
      canAccessTipping: false,
      canAccessUrlEncryption: false,
      canAccessStripeConnect: false,
      canAccessFanSubscriptions: false,
      canAccessEmailCampaigns: false,
      canAccessApiKeys: false,
      canAccessTeamManagement: false,
      canAccessWebhooks: false,
      canAccessWhiteLabel: false,
      canAccessAbTesting: false,
    },
    limits: {
      analyticsRetentionDays: 30,
      contactsLimit: 100,
      smartLinksLimit: null,
      aiDailyMessageLimit: 10,
      aiPitchGenPerRelease: 1,
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
        'Click & visit tracking',
        'Basic analytics (30 days)',
        'Audience intelligence',
        'Up to 100 contacts',
        'AI assistant (10 msgs/day)',
        '1 AI pitch generation per release',
      ],
      price: null,
    },
  },
  pro: {
    booleans: { ...PRO_BOOLEANS },
    limits: { ...PRO_LIMITS },
    marketing: {
      displayName: 'Pro',
      tagline: 'The serious artist toolkit.',
      features: PRO_FEATURES,
      price: { monthly: 20, yearly: 192 },
    },
  },
  max: {
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
      canAccessInbox: true,
      canAccessPreSave: true,
      canAccessTipping: true,
      canAccessUrlEncryption: true,
      canAccessStripeConnect: true,
      canAccessFanSubscriptions: true,
      canAccessEmailCampaigns: true,
      canAccessApiKeys: true,
      canAccessTeamManagement: true,
      canAccessWebhooks: true,
      canAccessWhiteLabel: true,
      canAccessAbTesting: true,
    },
    limits: {
      analyticsRetentionDays: null,
      contactsLimit: null,
      smartLinksLimit: null,
      aiDailyMessageLimit: 500,
      aiPitchGenPerRelease: null,
    },
    marketing: {
      displayName: 'Max',
      tagline: "Your team's command center.",
      features: [
        'All Pro features +',
        'Unlimited analytics',
        'AI assistant (500 messages/day)',
        'Stripe Connect payouts',
        'Fan subscriptions',
        'Email campaigns',
        'API access',
        'Team management',
        'Webhooks',
        'White-label / custom domain',
        'A/B testing',
      ],
      price: { monthly: 200, yearly: 1920 },
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
  readonly max: boolean | string;
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
      { name: 'Unlimited smart links', free: true, pro: true, max: true },
      { name: 'Auto-sync from Spotify', free: true, pro: true, max: true },
      {
        name: 'Smart deep links (native apps)',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Edit & customize smart links',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Release pages with listen links per DSP',
        free: true,
        pro: true,
        max: true,
      },
      { name: 'Short link redirects', free: true, pro: true, max: true },
      { name: 'Vanity URLs', free: true, pro: true, max: true },
      {
        name: 'Auto DSP detection & linking',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Manual release creation',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Pre-save campaigns',
        free: false,
        pro: true,
        max: true,
      },
      {
        name: 'Pre-release & countdown pages',
        free: false,
        pro: true,
        max: true,
      },
      {
        name: 'URL encryption',
        free: false,
        pro: true,
        max: true,
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
        max: true,
      },
      {
        name: 'Artist bio & social links',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Subscribe / follow page',
        free: true,
        pro: true,
        max: true,
      },
      { name: 'Contact page', free: true, pro: true, max: true },
      { name: 'About page', free: true, pro: true, max: true },
      {
        name: 'Tour dates (Bandsintown)',
        free: true,
        pro: true,
        max: true,
      },
      { name: 'Verified badge', free: false, pro: true, max: true },
      { name: 'Remove Jovie branding', free: false, pro: true, max: true },
      {
        name: 'White-label / custom domain',
        free: false,
        pro: false,
        max: true,
      },
    ],
  },
  {
    category: 'Analytics',
    features: [
      {
        name: 'Click & visit tracking',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Data retention',
        free: '30 days',
        pro: '180 days',
        max: 'Unlimited',
      },
      {
        name: 'Audience intelligence (device, location, intent)',
        free: true,
        pro: true,
        max: true,
      },
      {
        name: 'Advanced analytics & geographic insights',
        free: false,
        pro: true,
        max: true,
      },
      {
        name: 'Filter your own visits',
        free: false,
        pro: true,
        max: true,
      },
      { name: 'AI-powered insights', free: false, pro: true, max: true },
      { name: 'Ad pixel tracking', free: false, pro: true, max: true },
      {
        name: 'A/B testing',
        free: false,
        pro: false,
        max: true,
      },
    ],
  },
  {
    category: 'Audience & Growth',
    features: [
      {
        name: 'Contact / subscriber capture',
        free: 'Up to 100',
        pro: 'Up to 5,000',
        max: 'Unlimited',
      },
      {
        name: 'Release notifications (email to fans)',
        free: false,
        pro: true,
        max: true,
      },
      { name: 'Contact export', free: false, pro: true, max: true },
      { name: 'Fan CRM', free: false, pro: true, max: true },
      { name: 'Email campaigns', free: false, pro: false, max: true },
      {
        name: 'Automated follow-ups',
        free: false,
        pro: false,
        max: true,
        comingSoon: true,
      },
      {
        name: 'Catalog monitoring',
        free: false,
        pro: false,
        max: true,
        comingSoon: true,
      },
    ],
  },
  {
    category: 'Monetization',
    features: [
      { name: 'Tips & payments', free: false, pro: true, max: true },
      { name: 'Earnings dashboard', free: false, pro: true, max: true },
      { name: 'Stripe Connect payouts', free: false, pro: false, max: true },
      { name: 'Fan subscriptions', free: false, pro: false, max: true },
    ],
  },
  {
    category: 'AI Assistant',
    features: [
      {
        name: 'Daily messages',
        free: '10 / day',
        pro: '100 / day',
        max: '500 / day',
      },
      { name: 'AI tool use', free: true, pro: true, max: true },
      {
        name: 'AI pitch generation',
        free: '1 / release',
        pro: 'Unlimited',
        max: 'Unlimited',
      },
    ],
  },
  {
    category: 'Platform',
    features: [
      { name: 'Email support', free: true, pro: true, max: true },
      { name: 'Priority support', free: false, pro: true, max: true },
      { name: 'API access', free: false, pro: false, max: true },
      { name: 'Team management', free: false, pro: false, max: true },
      { name: 'Webhooks', free: false, pro: false, max: true },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a raw plan string to a registry entry, defaulting to free.
 * Handles backward compat: DB may still store 'growth' for legacy subscribers.
 */
export function getEntitlements(
  plan: string | null | undefined
): PlanEntitlements {
  if (plan === 'growth' || plan === 'max') return ENTITLEMENT_REGISTRY.max;
  if (plan === 'pro' || plan === 'founding') return ENTITLEMENT_REGISTRY.pro;
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
  return (
    plan === 'founding' || plan === 'pro' || plan === 'max' || plan === 'growth'
  );
}

/** Whether the plan has max-tier advanced features. */
export function hasAdvancedFeatures(plan: string | null | undefined): boolean {
  return plan === 'max' || plan === 'growth';
}

/** Display name for UI. */
export function getPlanDisplayName(plan: string | null | undefined): string {
  return getEntitlements(plan).marketing.displayName;
}

/** All valid plan IDs. */
export function getAllPlanIds(): readonly PlanId[] {
  return PLAN_IDS;
}

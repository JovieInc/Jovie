/**
 * Entitlement Registry — Single source of truth for plan features, limits, and marketing.
 *
 * All consumers (server.ts, usePlanGate, pricing page, rate-limit config) derive from this.
 * NO `import 'server-only'` — this must be client-importable.
 *
 * Pricing amounts are derived from plan-prices.ts (the canonical source).
 */

import { PLAN_PRICES } from '@/lib/config/plan-prices';

// ---------------------------------------------------------------------------
// Plan IDs
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'trial' | 'pro' | 'max';

const PLAN_IDS: readonly PlanId[] = ['free', 'trial', 'pro', 'max'] as const;

// ---------------------------------------------------------------------------
// Entitlement key unions
// ---------------------------------------------------------------------------

export type BooleanEntitlement =
  | 'canExportContacts'
  | 'canAccessAdvancedAnalytics'
  | 'canFilterSelfFromAnalytics'
  | 'canAccessAdPixels'
  | 'canBeVerified'
  | 'aiCanUseTools'
  | 'canGenerateAlbumArt'
  | 'canCreateManualReleases'
  | 'canAccessTasksWorkspace'
  | 'canGenerateReleasePlans'
  | 'canAccessMetadataSubmissionAgent'
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
  canExportContacts: true,
  canAccessAdvancedAnalytics: true,
  canFilterSelfFromAnalytics: true,
  canAccessAdPixels: true,
  canBeVerified: true,
  aiCanUseTools: true,
  canGenerateAlbumArt: true,
  canCreateManualReleases: true,
  canAccessTasksWorkspace: true,
  canGenerateReleasePlans: false,
  canAccessMetadataSubmissionAgent: false,
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
  contactsLimit: null,
  smartLinksLimit: null,
  aiDailyMessageLimit: 100,
  aiPitchGenPerRelease: 5,
};

const PRO_FEATURES: readonly string[] = [
  'All Free features +',
  'Release notifications to fans',
  'Pre-save campaigns',
  'Pre-release & countdown pages',
  'Extended analytics (180 days)',
  'Advanced analytics & geographic insights',
  'Traffic quality filtering',
  'AI-powered insights',
  'Unlimited contacts',
  'Contact export',
  'Fan CRM',
  'Tips & payments',
  'Earnings dashboard',
  'URL encryption',
  'Ad pixel tracking',
  'Verified badge',
  'AI assistant (100 messages/day)',
  'AI pitch generation (5 per release)',
  'Priority support',
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ENTITLEMENT_REGISTRY: Record<PlanId, PlanEntitlements> = {
  free: {
    booleans: {
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      canAccessAdPixels: false,
      canBeVerified: false,
      aiCanUseTools: true,
      canGenerateAlbumArt: false,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: false,
      canGenerateReleasePlans: false,
      canAccessMetadataSubmissionAgent: false,
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
      tagline: 'Your artist profile, free forever',
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
      tagline: 'Turn on fan notifications once. We handle the rest.',
      features: PRO_FEATURES,
      price: {
        monthly: PLAN_PRICES.pro.monthly,
        yearly: PLAN_PRICES.pro.yearly,
      },
    },
  },
  max: {
    booleans: {
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      canAccessAdPixels: true,
      canBeVerified: true,
      aiCanUseTools: true,
      canGenerateAlbumArt: true,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: true,
      canGenerateReleasePlans: true,
      canAccessMetadataSubmissionAgent: true,
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
      tagline: 'Your release ops, automated.',
      features: [
        'All Pro features +',
        'Release plan generation',
        'Metadata submission agent',
        'Unlimited analytics',
        'AI assistant (500 messages/day)',
        'Unlimited AI pitch generation',
        'Stripe Connect payouts',
        'Fan subscriptions',
        'Email campaigns',
        'API access',
        'Team management',
        'Webhooks',
        'White-label / custom domain',
        'A/B testing',
      ],
      price: {
        monthly: PLAN_PRICES.max.monthly,
        yearly: PLAN_PRICES.max.yearly,
      },
    },
  },
  trial: {
    booleans: {
      ...PRO_BOOLEANS,
    },
    limits: {
      analyticsRetentionDays: 180,
      contactsLimit: 250,
      smartLinksLimit: null,
      aiDailyMessageLimit: 25,
      aiPitchGenPerRelease: 3,
    },
    marketing: {
      displayName: 'Pro Trial',
      tagline: '14 days of Pro, on us.',
      features: PRO_FEATURES,
      price: null,
    },
  },
} as const;

/** 50 notification recipients total during trial period. */
export const TRIAL_NOTIFICATION_RECIPIENT_LIMIT = 50;

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
        name: 'Traffic quality filtering',
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
        pro: 'Unlimited',
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
        pro: '5 / release',
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
  if (plan === 'trial') return ENTITLEMENT_REGISTRY.trial;
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

/**
 * Resolve a raw plan string to the three-tier billing plan used by
 * chat-usage accounting and client-facing plan gates. Unlike
 * {@link getEntitlements}, this narrows to `'free' | 'pro' | 'max'`
 * (no 'trial'), which is the invariant callers like the chat usage
 * API and `usePlanGate` rely on. Maps legacy names ('founding' -> 'pro',
 * 'growth' -> 'max') and returns 'free' for null, undefined, trial, or
 * unknown plans.
 */
export function resolveChatUsagePlan(
  plan: string | null | undefined
): 'free' | 'pro' | 'max' {
  if (plan === 'max' || plan === 'growth') {
    return 'max';
  }
  if (plan === 'pro' || plan === 'founding') {
    return 'pro';
  }
  return 'free';
}

/** Whether the plan is pro or higher. */
export function isProPlan(plan: string | null | undefined): boolean {
  return (
    plan === 'founding' ||
    plan === 'pro' ||
    plan === 'trial' ||
    plan === 'max' ||
    plan === 'growth'
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

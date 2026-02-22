/**
 * Entitlement Registry — Single source of truth for plan features, limits, and marketing.
 *
 * All consumers (server.ts, usePlanGate, pricing page, rate-limit config) derive from this.
 * NO `import 'server-only'` — this must be client-importable.
 */

// ---------------------------------------------------------------------------
// Plan IDs
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'pro' | 'growth';

const PLAN_IDS: readonly PlanId[] = ['free', 'pro', 'growth'] as const;

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
    price: { monthly: number; yearly: number } | null;
  };
}

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
        'Release notifications',
        'Manual release creation',
        'AI-powered assistant (25 msgs/day)',
        'Basic analytics (30 days)',
        'Up to 100 contacts',
      ],
      price: null,
    },
  },
  pro: {
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
      analyticsRetentionDays: 90,
      contactsLimit: null,
      smartLinksLimit: null,
      aiDailyMessageLimit: 100,
    },
    marketing: {
      displayName: 'Pro',
      tagline: 'For growing artists',
      features: [
        'All Free features +',
        'Pre-release & countdown pages',
        'Remove Jovie branding',
        'Extended analytics (90 days)',
        'Advanced analytics & geographic insights',
        'Filter your own visits',
        'Unlimited contacts',
        'Contact export',
        'Verified badge',
        'AI assistant (100 messages/day)',
        'Priority support',
      ],
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
        'Automated follow-ups',
        'A/B testing',
        'Meta pixel integration',
        'Custom domain',
        'Catalog monitoring',
        'Impersonation detection',
      ],
      price: { monthly: 99, yearly: 948 },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a raw plan string to a registry entry, defaulting to free. */
export function getEntitlements(
  plan: string | null | undefined
): PlanEntitlements {
  if (plan === 'growth') return ENTITLEMENT_REGISTRY.growth;
  if (plan === 'pro') return ENTITLEMENT_REGISTRY.pro;
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
  return plan === 'pro' || plan === 'growth';
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

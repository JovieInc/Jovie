import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BooleanEntitlement,
  checkBoolean,
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
  getEntitlements,
  getLimit,
  getPlanDisplayName,
  hasAdvancedFeatures,
  isProPlan,
  isValidPlanId,
  type NumericEntitlement,
  resolveCanonicalPlanId,
  resolveChatUsagePlan,
  TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
} from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

// Hoisted mocks for server resolver coverage (Clerk catch + contract paths)
const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockGetUserBillingInfo,
  mockIsAdmin,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockGetUserBillingInfo: vi.fn(),
  mockIsAdmin: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// Contract matrix — 4 plans × 28 booleans + 7 limits (exact values for mutation killing)
const BOOLS_FREE: Record<BooleanEntitlement, boolean> = {
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
  canAccessMerchCreation: false,
  canAccessAiRetouching: false,
};

const BOOLS_PRO: Record<BooleanEntitlement, boolean> = {
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
  canAccessMerchCreation: true,
  canAccessAiRetouching: true,
};

const BOOLS_MAX: Record<BooleanEntitlement, boolean> = {
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
  canAccessMerchCreation: true,
  canAccessAiRetouching: true,
};

const BOOLS_TRIAL: Record<BooleanEntitlement, boolean> = { ...BOOLS_PRO };

const LIMITS_FREE = {
  analyticsRetentionDays: 30,
  contactsLimit: 100,
  smartLinksLimit: null,
  aiDailyMessageLimit: 10,
  aiPitchGenPerRelease: 1,
  aiRetouchDailyLimit: null,
  chatFileUploadLimit: 5,
  profileMonitoringLimit: 5,
} as const;

const LIMITS_PRO = {
  analyticsRetentionDays: 180,
  contactsLimit: null,
  smartLinksLimit: null,
  aiDailyMessageLimit: 100,
  aiPitchGenPerRelease: 5,
  aiRetouchDailyLimit: 10,
  chatFileUploadLimit: null,
  profileMonitoringLimit: 25,
} as const;

const LIMITS_MAX = {
  analyticsRetentionDays: null,
  contactsLimit: null,
  smartLinksLimit: null,
  aiDailyMessageLimit: 500,
  aiPitchGenPerRelease: null,
  aiRetouchDailyLimit: 50,
  chatFileUploadLimit: null,
  profileMonitoringLimit: null,
} as const;

const LIMITS_TRIAL = {
  analyticsRetentionDays: 180,
  contactsLimit: 250,
  smartLinksLimit: null,
  aiDailyMessageLimit: 25,
  aiPitchGenPerRelease: 3,
  aiRetouchDailyLimit: 10,
  chatFileUploadLimit: 15,
  profileMonitoringLimit: 15,
} as const;

const MATRIX = {
  free: { booleans: BOOLS_FREE, limits: LIMITS_FREE },
  pro: { booleans: BOOLS_PRO, limits: LIMITS_PRO },
  max: { booleans: BOOLS_MAX, limits: LIMITS_MAX },
  trial: { booleans: BOOLS_TRIAL, limits: LIMITS_TRIAL },
} as const;

describe('Entitlements registry plan matrix contract (4 plans × 28 booleans + 7 limits + legacy)', () => {
  it('getAllPlanIds returns exactly the 4 canonical PlanIds', () => {
    expect(getAllPlanIds()).toEqual(['free', 'trial', 'pro', 'max'] as const);
  });

  it('ENTITLEMENT_REGISTRY holds the exact source-of-truth matrix for all 4 plans', () => {
    (['free', 'pro', 'max', 'trial'] as const).forEach(plan => {
      const entry = ENTITLEMENT_REGISTRY[plan];
      expect(entry.booleans).toEqual(MATRIX[plan].booleans);
      expect(entry.limits).toEqual(MATRIX[plan].limits);
    });
  });

  it('checkBoolean/getLimit cover every key in the 28×4 + 7×4 matrix', () => {
    (['free', 'pro', 'max', 'trial'] as const).forEach(plan => {
      const m = MATRIX[plan];
      (Object.keys(m.booleans) as BooleanEntitlement[]).forEach(key => {
        expect(checkBoolean(plan, key)).toBe(m.booleans[key]);
      });
      (Object.keys(m.limits) as NumericEntitlement[]).forEach(key => {
        expect(getLimit(plan, key)).toBe(m.limits[key]);
      });
    });
  });

  it('legacy aliases (founding→pro, growth→max) resolve correctly in all helpers', () => {
    // getEntitlements
    expect(getEntitlements('founding')).toBe(ENTITLEMENT_REGISTRY.pro);
    expect(getEntitlements('growth')).toBe(ENTITLEMENT_REGISTRY.max);
    expect(getEntitlements('pro')).toBe(ENTITLEMENT_REGISTRY.pro);
    expect(getEntitlements('max')).toBe(ENTITLEMENT_REGISTRY.max);
    expect(getEntitlements(null)).toBe(ENTITLEMENT_REGISTRY.free);

    // resolveCanonical + isValid
    expect(resolveCanonicalPlanId('founding')).toBe('pro');
    expect(resolveCanonicalPlanId('growth')).toBe('max');
    expect(resolveCanonicalPlanId('trial')).toBe('trial');
    expect(resolveCanonicalPlanId('')).toBe(null);
    expect(isValidPlanId('founding')).toBe(true);
    expect(isValidPlanId('growth')).toBe(true);
    expect(isValidPlanId('free')).toBe(true);
    expect(isValidPlanId('x')).toBe(false);

    // chat usage + pro/advanced predicates
    expect(resolveChatUsagePlan('founding')).toBe('pro');
    expect(resolveChatUsagePlan('growth')).toBe('max');
    expect(resolveChatUsagePlan('trial')).toBe('free');
    expect(isProPlan('founding')).toBe(true);
    expect(isProPlan('growth')).toBe(true);
    expect(isProPlan('trial')).toBe(true);
    expect(isProPlan('free')).toBe(false);
    expect(hasAdvancedFeatures('growth')).toBe(true);
    expect(hasAdvancedFeatures('max')).toBe(true);
    expect(hasAdvancedFeatures('pro')).toBe(false);
    expect(hasAdvancedFeatures('founding')).toBe(false);
  });

  it('display names and exported trial limit', () => {
    expect(getPlanDisplayName('free')).toBe('Free');
    expect(getPlanDisplayName('pro')).toBe('Pro');
    expect(getPlanDisplayName('max')).toBe('Max');
    expect(getPlanDisplayName('trial')).toBe('Pro Trial');
    expect(getPlanDisplayName('founding')).toBe('Pro');
    expect(getPlanDisplayName('growth')).toBe('Max');
    expect(TRIAL_NOTIFICATION_RECIPIENT_LIMIT).toBe(50);
  });
});

describe('getCurrentUserEntitlements server resolver (targeted contract + catch branch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Clerk resolve failure is caught (email=null) while still returning correct entitlements', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'u_catch' });
    mockCachedCurrentUser.mockRejectedValue(new Error('clerk transient'));
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: { email: null, isPro: true, plan: 'max' },
    });

    const e = await getCurrentUserEntitlements();
    expect(e.userId).toBe('u_catch');
    expect(e.email).toBeNull(); // exercised the catch (clerkEmail null || db null)
    expect(e.plan).toBe('max');
    expect(e.hasAdvancedFeatures).toBe(true);
    expect(e.canAccessWebhooks).toBe(true); // max-only capability
  });
});

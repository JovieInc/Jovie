import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveChatAccountContext } from '@/lib/chat/account-context';
import type { UserEntitlements } from '@/types';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlementsMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  getStatusMock: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: hoisted.getAppFlagValueMock,
}));

vi.mock('@/lib/rate-limit/limiters', () => ({
  aiChatDailyPlanAwareLimiter: {
    getStatus: hoisted.getStatusMock,
  },
}));

function makeEntitlements(
  overrides: Partial<UserEntitlements> = {}
): UserEntitlements {
  return {
    userId: 'user_123',
    email: 'artist@example.com',
    isAuthenticated: true,
    isAdmin: false,
    plan: 'pro',
    isPro: true,
    hasAdvancedFeatures: false,
    isTrialing: false,
    trialEndsAt: null,
    trialDaysRemaining: null,
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
    analyticsRetentionDays: 180,
    contactsLimit: null,
    smartLinksLimit: null,
    aiDailyMessageLimit: 100,
    aiPitchGenPerRelease: 5,
    aiRetouchDailyLimit: 10,
    billingVerification: 'verified',
    billingPlanMismatch: null,
    hasStripeCustomer: true,
    hasStripeSubscription: true,
    ...overrides,
  };
}

describe('resolveChatAccountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAppFlagValueMock.mockResolvedValue(true);
    hoisted.getStatusMock.mockReturnValue({
      remaining: 92,
      resetTime: Date.UTC(2026, 4, 24, 7, 0, 0),
    });
  });

  it('returns verified pro account context with merch access and usage', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        email: 'tim@jov.ie',
        billingPlanMismatch: {
          rawPlan: 'free',
          normalizedPlan: 'pro',
          reason: 'is_pro_true_with_non_paid_plan',
        },
      })
    );

    const context = await resolveChatAccountContext({ userId: 'user_123' });

    expect(context.email).toBe('tim@jov.ie');
    expect(context.plan).toBe('pro');
    expect(context.displayPlan).toBe('Pro');
    expect(context.isPro).toBe(true);
    expect(context.billingVerification).toBe('verified');
    expect(context.entitlements.canAccessMerchCreation).toBe(true);
    expect(context.flags.merchMvp).toBe(true);
    expect(context.merchAccess.available).toBe(true);
    expect(context.usage).toMatchObject({
      dailyLimit: 100,
      used: 8,
      remaining: 92,
      resetAt: '2026-05-24T07:00:00.000Z',
    });
    expect(context.planMismatch).toEqual({
      rawPlan: 'free',
      normalizedPlan: 'pro',
      reason: 'is_pro_true_with_non_paid_plan',
    });
  });

  it('explains merch denial for verified free accounts', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        plan: 'free',
        isPro: false,
        canAccessMerchCreation: false,
        canGenerateAlbumArt: false,
        canAccessAdvancedAnalytics: false,
        aiDailyMessageLimit: 10,
      })
    );

    const context = await resolveChatAccountContext({ userId: 'user_free' });

    expect(context.billingVerification).toBe('verified');
    expect(context.merchAccess).toEqual({
      available: false,
      reason: 'plan_unavailable',
    });
  });

  it('explains merch denial as billing unavailable instead of free when verification failed', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        plan: 'free',
        isPro: false,
        canAccessMerchCreation: false,
        billingVerification: 'unavailable',
        hasStripeCustomer: false,
        hasStripeSubscription: false,
      })
    );

    const context = await resolveChatAccountContext({ userId: 'user_123' });

    expect(context.billingVerification).toBe('unavailable');
    expect(context.merchAccess).toEqual({
      available: false,
      reason: 'billing_unavailable',
    });
    expect(context.usage).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

const { mockCachedAuth, mockCachedCurrentUser } = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
}));

const { mockGetUserBillingInfo } = vi.hoisted(() => ({
  mockGetUserBillingInfo: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

describe('getCurrentUserEntitlements', () => {
  it('returns anonymous entitlements when not authenticated', async () => {
    mockCachedAuth.mockResolvedValue({ userId: null });
    mockCachedCurrentUser.mockResolvedValue(null);

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
      plan: 'free',
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      analyticsRetentionDays: 7,
      contactsLimit: 100,
    });
  });

  it('returns basic entitlements when authenticated but billing lookup fails', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'basic@example.com' },
    });
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'not found',
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_123',
      email: 'basic@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'free',
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      analyticsRetentionDays: 7,
      contactsLimit: 100,
    });
  });

  it('maps billing data for a free user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_free' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'free@example.com' },
    });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'free@example.com',
        isAdmin: false,
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_free',
      email: 'free@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'free',
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      analyticsRetentionDays: 7,
      contactsLimit: 100,
    });
  });

  it('maps billing data for a pro user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_pro' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'pro@example.com' },
    });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'pro@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // Note: hasAdvancedFeatures is only true for 'growth' plan, not 'pro'
    expect(entitlements).toEqual({
      userId: 'user_pro',
      email: 'pro@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      isPro: true,
      hasAdvancedFeatures: false,
      canRemoveBranding: true,
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      analyticsRetentionDays: 90,
      contactsLimit: null,
    });
  });
});

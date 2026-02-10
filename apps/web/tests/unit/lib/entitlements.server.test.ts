import { describe, expect, it, vi } from 'vitest';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';

const { mockCachedAuth, mockCachedCurrentUser } = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
}));

const { mockGetUserBillingInfo } = vi.hoisted(() => ({
  mockGetUserBillingInfo: vi.fn(),
}));

const { mockIsAdmin } = vi.hoisted(() => ({
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
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('getCurrentUserEntitlements', () => {
  it('returns unauthenticated entitlements when not authenticated', async () => {
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

  it('throws BillingUnavailableError when billing lookup fails', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'database connection failed',
    });

    await expect(getCurrentUserEntitlements()).rejects.toThrow(
      BillingUnavailableError
    );
  });

  it('BillingUnavailableError preserves admin status', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'timeout',
    });

    try {
      await getCurrentUserEntitlements();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BillingUnavailableError);
      const billingError = error as BillingUnavailableError;
      expect(billingError.userId).toBe('user_admin');
      expect(billingError.isAdmin).toBe(true);
    }
  });

  it('returns free entitlements when billing data is null (new user)', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_new' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'new@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: null,
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.userId).toBe('user_new');
    expect(entitlements.isAuthenticated).toBe(true);
    expect(entitlements.plan).toBe('free');
    expect(entitlements.isPro).toBe(false);
    expect(entitlements.contactsLimit).toBe(100);
    expect(entitlements.analyticsRetentionDays).toBe(7);
  });

  it('maps billing data for a free user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_free' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'free@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
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
    mockIsAdmin.mockResolvedValue(false);
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

  it('maps billing data for a growth user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_growth' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'growth@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'growth@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'growth',
        stripeCustomerId: 'cus_456',
        stripeSubscriptionId: 'sub_456',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_growth',
      email: 'growth@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'growth',
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      analyticsRetentionDays: 365,
      contactsLimit: null,
    });
  });

  it('admin status is fetched independently of billing', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'admin@example.com',
        isAdmin: false, // DB says not admin, but role check says yes
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // isAdmin comes from the role check (Redis), not from billing DB
    expect(entitlements.isAdmin).toBe(true);
  });
});

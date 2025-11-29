import { describe, expect, it, vi } from 'vitest';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

const { mockGetUserBillingInfo } = vi.hoisted(() => ({
  mockGetUserBillingInfo: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

describe('getCurrentUserEntitlements', () => {
  it('returns anonymous entitlements when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: null,
      email: null,
      isAuthenticated: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
  });

  it('returns basic entitlements when authenticated but billing lookup fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'not found',
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_123',
      email: null,
      isAuthenticated: true,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
  });

  it('maps billing data for a free user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_free' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'free@example.com',
        isPro: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_free',
      email: 'free@example.com',
      isAuthenticated: true,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
  });

  it('maps billing data for a pro user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_pro' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'pro@example.com',
        isPro: true,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_pro',
      email: 'pro@example.com',
      isAuthenticated: true,
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
    });
  });
});

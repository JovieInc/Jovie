import { describe, expect, it, vi } from 'vitest';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

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

describe('entitlements concurrent access isolation', () => {
  it('keeps per-request data isolated across concurrent calls', async () => {
    const authSequence = [
      { userId: 'user_free' },
      { userId: 'user_pro' },
      { userId: 'user_growth' },
    ];

    mockCachedAuth.mockImplementation(async () => authSequence.shift());
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'fallback@example.com' },
    });

    mockIsAdmin.mockImplementation(
      async (userId: string) => userId === 'user_growth'
    );

    mockGetUserBillingInfo
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_free',
          email: 'free@example.com',
          isAdmin: false,
          isPro: false,
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_pro',
          email: 'pro@example.com',
          isAdmin: false,
          isPro: true,
          plan: 'pro',
          stripeCustomerId: 'cus_pro',
          stripeSubscriptionId: 'sub_pro',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_growth',
          email: 'growth@example.com',
          isAdmin: false,
          isPro: true,
          plan: 'growth',
          stripeCustomerId: 'cus_growth',
          stripeSubscriptionId: 'sub_growth',
        },
      });

    const [free, pro, growth] = await Promise.all([
      getCurrentUserEntitlements(),
      getCurrentUserEntitlements(),
      getCurrentUserEntitlements(),
    ]);

    expect(free.userId).toBe('user_free');
    expect(free.plan).toBe('free');
    expect(free.contactsLimit).toBe(100);
    expect(free.isAdmin).toBe(false);

    expect(pro.userId).toBe('user_pro');
    expect(pro.plan).toBe('pro');
    expect(pro.contactsLimit).toBeNull();
    expect(pro.hasAdvancedFeatures).toBe(false);

    expect(growth.userId).toBe('user_growth');
    expect(growth.plan).toBe('growth');
    expect(growth.hasAdvancedFeatures).toBe(true);
    expect(growth.isAdmin).toBe(true);
  });
});

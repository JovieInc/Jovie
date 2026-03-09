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

describe('entitlement state transitions', () => {
  it('tracks free -> pro -> growth transitions without stale values', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_transition' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'transition@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);

    mockGetUserBillingInfo
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_id',
          email: 'transition@example.com',
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
          userId: 'db_id',
          email: 'transition@example.com',
          isAdmin: false,
          isPro: true,
          plan: 'pro',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_id',
          email: 'transition@example.com',
          isAdmin: false,
          isPro: true,
          plan: 'growth',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      });

    const free = await getCurrentUserEntitlements();
    const pro = await getCurrentUserEntitlements();
    const growth = await getCurrentUserEntitlements();

    expect(free.plan).toBe('free');
    expect(free.isPro).toBe(false);
    expect(free.aiDailyMessageLimit).toBe(25);

    expect(pro.plan).toBe('pro');
    expect(pro.isPro).toBe(true);
    expect(pro.hasAdvancedFeatures).toBe(false);
    expect(pro.aiDailyMessageLimit).toBe(100);

    expect(growth.plan).toBe('growth');
    expect(growth.isPro).toBe(true);
    expect(growth.hasAdvancedFeatures).toBe(true);
    expect(growth.aiDailyMessageLimit).toBe(500);
  });

  it('tracks downgrade to free when subscription is no longer active', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_downgrade' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'downgrade@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);

    mockGetUserBillingInfo
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_id',
          email: 'downgrade@example.com',
          isAdmin: false,
          isPro: true,
          plan: 'growth',
          stripeCustomerId: 'cus_2',
          stripeSubscriptionId: 'sub_2',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'db_id',
          email: 'downgrade@example.com',
          isAdmin: false,
          isPro: false,
          plan: 'growth',
          stripeCustomerId: 'cus_2',
          stripeSubscriptionId: null,
        },
      });

    const beforeCancel = await getCurrentUserEntitlements();
    const afterCancel = await getCurrentUserEntitlements();

    expect(beforeCancel.plan).toBe('growth');
    expect(beforeCancel.contactsLimit).toBeNull();

    expect(afterCancel.plan).toBe('free');
    expect(afterCancel.isPro).toBe(false);
    expect(afterCancel.hasAdvancedFeatures).toBe(false);
    expect(afterCancel.contactsLimit).toBe(100);
  });
});

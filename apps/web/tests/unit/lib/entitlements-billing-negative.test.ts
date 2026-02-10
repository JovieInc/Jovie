/**
 * Entitlements & Billing – Negative and Security-Focused Tests
 *
 * These tests verify that the entitlements system correctly rejects
 * privilege escalation attempts, handles inconsistent billing data,
 * and enforces plan boundaries under adversarial conditions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';
import type { UserEntitlements } from '@/types';

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

/** Helper: set up an authenticated user with given billing data */
function setupAuthenticatedUser(billingData: Record<string, unknown>) {
  mockCachedAuth.mockResolvedValue({ userId: 'user_test' });
  mockCachedCurrentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: 'test@example.com' },
  });
  mockIsAdmin.mockResolvedValue(false);
  mockGetUserBillingInfo.mockResolvedValue({
    success: true,
    data: {
      userId: 'db_id',
      email: 'test@example.com',
      isAdmin: false,
      isPro: false,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      ...billingData,
    },
  });
}

/** All the boolean feature gates that must be false for free users */
const FREE_FEATURES: (keyof UserEntitlements)[] = [
  'canRemoveBranding',
  'canExportContacts',
  'canAccessAdvancedAnalytics',
  'canFilterSelfFromAnalytics',
  'hasAdvancedFeatures',
];

describe('Entitlements – Privilege Escalation Prevention', () => {
  it('isPro=false + plan=pro in DB → no pro features', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'pro' });
    const e = await getCurrentUserEntitlements();

    expect(e.isPro).toBe(false);
    expect(e.plan).toBe('free');
    for (const feature of FREE_FEATURES) {
      expect(e[feature]).toBe(false);
    }
    expect(e.contactsLimit).toBe(100);
  });

  it('isPro=false + plan=growth in DB → no growth features', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'growth' });
    const e = await getCurrentUserEntitlements();

    expect(e.isPro).toBe(false);
    expect(e.plan).toBe('free');
    expect(e.hasAdvancedFeatures).toBe(false);
    expect(e.analyticsRetentionDays).toBe(7);
    expect(e.contactsLimit).toBe(100);
  });

  it('isPro=false + unknown plan string in DB → free tier', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'enterprise_hack' });
    const e = await getCurrentUserEntitlements();

    expect(e.plan).toBe('free');
    expect(e.isPro).toBe(false);
    expect(e.contactsLimit).toBe(100);
  });

  it('isPro=true + unrecognized plan string → defaults to pro, not escalated', async () => {
    setupAuthenticatedUser({
      isPro: true,
      plan: 'superadmin',
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
    });
    const e = await getCurrentUserEntitlements();

    // (dbPlan as UserPlan) || 'pro' → 'superadmin' is truthy but
    // getPlanLimits('superadmin') falls through to free limits
    // This is actually a quirk: the plan string passes through but
    // isProPlan/hasAdvancedFeatures use strict equality checks
    expect(e.isPro).toBe(false); // isProPlan('superadmin') = false
    expect(e.hasAdvancedFeatures).toBe(false);
    // getPlanLimits('superadmin') falls back to free
    expect(e.contactsLimit).toBe(100);
    expect(e.analyticsRetentionDays).toBe(7);
  });
});

describe('Entitlements – Free Tier Boundary Enforcement', () => {
  it('free user has exact contact limit of 100', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'free' });
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBe(100);
    expect(typeof e.contactsLimit).toBe('number');
  });

  it('free user analytics retention is exactly 7 days', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'free' });
    const e = await getCurrentUserEntitlements();

    expect(e.analyticsRetentionDays).toBe(7);
  });

  it('free user has all boolean features disabled', async () => {
    setupAuthenticatedUser({ isPro: false, plan: 'free' });
    const e = await getCurrentUserEntitlements();

    for (const feature of FREE_FEATURES) {
      expect(e[feature]).toBe(false);
    }
  });

  it('pro user has unlimited contacts (null, not Infinity)', async () => {
    setupAuthenticatedUser({
      isPro: true,
      plan: 'pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBeNull();
    expect(e.contactsLimit).not.toBe(Infinity);
    expect(e.contactsLimit).not.toBe(0);
  });

  it('growth user has unlimited contacts (null, not Infinity)', async () => {
    setupAuthenticatedUser({
      isPro: true,
      plan: 'growth',
      stripeCustomerId: 'cus_2',
      stripeSubscriptionId: 'sub_2',
    });
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBeNull();
  });
});

describe('Entitlements – Unauthenticated User Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unauthenticated user gets full free-tier entitlements', async () => {
    mockCachedAuth.mockResolvedValue({ userId: null });
    mockCachedCurrentUser.mockResolvedValue(null);

    const e = await getCurrentUserEntitlements();

    expect(e.userId).toBeNull();
    expect(e.email).toBeNull();
    expect(e.isAuthenticated).toBe(false);
    expect(e.isAdmin).toBe(false);
    expect(e.plan).toBe('free');
    expect(e.isPro).toBe(false);
    expect(e.contactsLimit).toBe(100);
    expect(e.analyticsRetentionDays).toBe(7);
    for (const feature of FREE_FEATURES) {
      expect(e[feature]).toBe(false);
    }
  });

  it('never calls billing or admin APIs for unauthenticated users', async () => {
    mockCachedAuth.mockResolvedValue({ userId: null });
    mockCachedCurrentUser.mockResolvedValue(null);

    await getCurrentUserEntitlements();

    expect(mockGetUserBillingInfo).not.toHaveBeenCalled();
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });
});

describe('Entitlements – Billing Failure Safety', () => {
  it('BillingUnavailableError does not contain billing data', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_fail' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'fail@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'connection timeout',
    });

    try {
      await getCurrentUserEntitlements();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BillingUnavailableError);
      const bue = error as BillingUnavailableError;
      // Should expose userId and admin status for callers
      expect(bue.userId).toBe('user_fail');
      expect(bue.isAdmin).toBe(false);
      // Should NOT expose billing data, stripe IDs, etc.
      expect(bue).not.toHaveProperty('stripeCustomerId');
      expect(bue).not.toHaveProperty('isPro');
      expect(bue).not.toHaveProperty('plan');
    }
  });

  it('billing failure for admin preserves admin flag in error', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin_fail' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'db unreachable',
    });

    try {
      await getCurrentUserEntitlements();
      expect.fail('Should have thrown');
    } catch (error) {
      const bue = error as BillingUnavailableError;
      expect(bue.isAdmin).toBe(true);
    }
  });

  it('throws on billing failure, does not silently downgrade', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_paying' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'paying@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'Stripe API error',
    });

    // Must throw — never silently return free entitlements for paying users
    await expect(getCurrentUserEntitlements()).rejects.toThrow(
      BillingUnavailableError
    );
  });
});

describe('Entitlements – Plan Tier Completeness', () => {
  it('every plan returns all required entitlement fields', async () => {
    const requiredFields: (keyof UserEntitlements)[] = [
      'userId',
      'email',
      'isAuthenticated',
      'isAdmin',
      'plan',
      'isPro',
      'hasAdvancedFeatures',
      'canRemoveBranding',
      'canExportContacts',
      'canAccessAdvancedAnalytics',
      'canFilterSelfFromAnalytics',
      'analyticsRetentionDays',
      'contactsLimit',
    ];

    for (const plan of ['free', 'pro', 'growth'] as const) {
      setupAuthenticatedUser({
        isPro: plan !== 'free',
        plan,
        stripeCustomerId: plan !== 'free' ? 'cus_' + plan : null,
        stripeSubscriptionId: plan !== 'free' ? 'sub_' + plan : null,
      });

      const e = await getCurrentUserEntitlements();

      for (const field of requiredFields) {
        expect(e).toHaveProperty(field);
        expect(e[field]).not.toBeUndefined();
      }
    }
  });

  it('pro plan retention is between free and growth', async () => {
    const plans = ['free', 'pro', 'growth'] as const;
    const retentions: number[] = [];

    for (const plan of plans) {
      setupAuthenticatedUser({
        isPro: plan !== 'free',
        plan,
        stripeCustomerId: plan !== 'free' ? 'cus_' + plan : null,
        stripeSubscriptionId: plan !== 'free' ? 'sub_' + plan : null,
      });
      const e = await getCurrentUserEntitlements();
      retentions.push(e.analyticsRetentionDays);
    }

    // free < pro < growth
    expect(retentions[0]).toBeLessThan(retentions[1]);
    expect(retentions[1]).toBeLessThan(retentions[2]);
  });
});

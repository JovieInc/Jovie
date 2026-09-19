import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchUserBillingDataWithAuth, mockFetchUserBillingData } =
  vi.hoisted(() => ({
    mockFetchUserBillingDataWithAuth: vi.fn(),
    mockFetchUserBillingData: vi.fn(),
  }));

vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataWithAuth: mockFetchUserBillingDataWithAuth,
  fetchUserBillingData: mockFetchUserBillingData,
}));

import {
  getUserBillingInfo,
  getUserBillingInfoByClerkId,
  userHasProFeatures,
} from '@/lib/stripe/customer-sync/billing-info';
import { BILLING_FIELDS_FULL } from '@/lib/stripe/customer-sync/types';

describe('getUserBillingInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns successful empty billing data when user row is missing', async () => {
    mockFetchUserBillingDataWithAuth.mockResolvedValue({
      success: false,
      error: 'User not found',
    });

    const result = await getUserBillingInfo();

    expect(result).toEqual({
      success: true,
      data: undefined,
    });
  });

  it('preserves failure for non-user-not-found errors', async () => {
    mockFetchUserBillingDataWithAuth.mockResolvedValue({
      success: false,
      error: 'Failed to retrieve billing data',
    });

    const result = await getUserBillingInfo();

    expect(result).toEqual({
      success: false,
      error: 'Failed to retrieve billing data',
    });
  });

  it('preserves subscription price provenance for entitlement resolution', async () => {
    mockFetchUserBillingDataWithAuth.mockResolvedValue({
      success: true,
      data: {
        id: 'user_1',
        plan: 'pro',
        isPro: true,
        stripePriceId: 'price_legacy',
      },
    });

    const result = await getUserBillingInfo();

    expect(result.data?.stripePriceId).toBe('price_legacy');
    expect(mockFetchUserBillingDataWithAuth).toHaveBeenCalledWith({
      fields: BILLING_FIELDS_FULL,
    });
  });

  it('normalizes nullable billing fields while retaining the price field', async () => {
    mockFetchUserBillingDataWithAuth.mockResolvedValue({
      success: true,
      data: {
        id: 'user_defaults',
        email: null,
        isAdmin: null,
        isPro: null,
        plan: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        trialEndsAt: null,
        billingVersion: null,
        lastBillingEventAt: null,
      },
    });

    await expect(getUserBillingInfo()).resolves.toEqual({
      success: true,
      data: {
        userId: 'user_defaults',
        email: '',
        isAdmin: false,
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        trialEndsAt: null,
        billingVersion: 1,
        lastBillingEventAt: null,
      },
    });
  });

  it('preserves trial expiry from the full billing query', async () => {
    const trialEndsAt = new Date('2026-10-15T00:00:00.000Z');
    mockFetchUserBillingDataWithAuth.mockResolvedValue({
      success: true,
      data: {
        id: 'user_trial',
        email: 'trial@example.com',
        isAdmin: false,
        isPro: false,
        plan: 'trial',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        trialEndsAt,
        billingVersion: 1,
        lastBillingEventAt: null,
      },
    });

    const result = await getUserBillingInfo();

    expect(result.success).toBe(true);
    expect(result.data?.trialEndsAt).toEqual(trialEndsAt);
    expect(mockFetchUserBillingDataWithAuth).toHaveBeenCalledWith({
      fields: BILLING_FIELDS_FULL,
    });
  });

  it('loads billing data by Clerk ID and forwards query failures', async () => {
    mockFetchUserBillingData.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'user_clerk',
        email: null,
        isPro: true,
        stripeCustomerId: 'cus_clerk',
        stripeSubscriptionId: 'sub_clerk',
        trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
        billingVersion: null,
        lastBillingEventAt: null,
      },
    });

    await expect(getUserBillingInfoByClerkId('clerk_user')).resolves.toEqual({
      success: true,
      data: {
        id: 'user_clerk',
        email: '',
        isPro: true,
        stripeCustomerId: 'cus_clerk',
        stripeSubscriptionId: 'sub_clerk',
        trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
        billingVersion: 1,
        lastBillingEventAt: null,
      },
    });
    expect(mockFetchUserBillingData).toHaveBeenCalledWith({
      clerkUserId: 'clerk_user',
      fields: BILLING_FIELDS_FULL,
    });

    mockFetchUserBillingData.mockResolvedValueOnce({ success: false });
    await expect(getUserBillingInfoByClerkId('missing_user')).resolves.toEqual({
      success: false,
      error: 'Failed to retrieve billing information',
    });
  });

  it('reports Pro status through the convenience helper', async () => {
    mockFetchUserBillingDataWithAuth.mockResolvedValueOnce({
      success: true,
      data: { id: 'user_pro', isPro: true },
    });
    await expect(userHasProFeatures()).resolves.toBe(true);

    mockFetchUserBillingDataWithAuth.mockResolvedValueOnce({
      success: true,
      data: { id: 'user_free', isPro: false },
    });
    await expect(userHasProFeatures()).resolves.toBe(false);
  });
});

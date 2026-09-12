import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchUserBillingDataWithAuth } = vi.hoisted(() => ({
  mockFetchUserBillingDataWithAuth: vi.fn(),
}));

vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataWithAuth: mockFetchUserBillingDataWithAuth,
  fetchUserBillingData: vi.fn(),
}));

import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';
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
});

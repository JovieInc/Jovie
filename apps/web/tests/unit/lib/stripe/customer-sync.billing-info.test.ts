import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchUserBillingDataWithAuth } = vi.hoisted(() => ({
  mockFetchUserBillingDataWithAuth: vi.fn(),
}));

vi.mock('@/lib/stripe/customer-sync/queries', () => ({
  fetchUserBillingDataWithAuth: mockFetchUserBillingDataWithAuth,
  fetchUserBillingData: vi.fn(),
}));

import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';

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
});

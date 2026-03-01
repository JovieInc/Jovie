import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDbQuery,
  createMockDbQueryRejecting,
  mockBillingAuditLog,
  mockCaptureWarning,
  mockDb,
  mockDbSelect,
  mockUsersTable,
} from './customer-sync.test-utils';

const { mockGetCachedAuth } = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/client/connection', () => ({
  db: mockDb,
  initializeDb: vi.fn(),
  getDb: vi.fn(),
  getPoolMetrics: vi.fn(),
  getPoolState: vi.fn(),
}));
vi.mock('@/lib/db/schema', () => ({
  users: mockUsersTable,
  billingAuditLog: mockBillingAuditLog,
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: mockUsersTable,
  billingAuditLog: mockBillingAuditLog,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: mockCaptureWarning,
}));
vi.mock('server-only', () => ({}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', left: a, right: b })),
}));

import {
  BILLING_FIELDS_STATUS,
  fetchUserBillingDataWithAuth,
} from '@/lib/stripe/customer-sync';

describe('fetchUserBillingDataWithAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth error when user is not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const result = await fetchUserBillingDataWithAuth();

    expect(result).toEqual({ success: false, error: 'User not authenticated' });
  });

  it('retries once when first billing lookup fails', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbSelect
      .mockReturnValueOnce(
        createMockDbQueryRejecting(new Error('first lookup failed'))
      )
      .mockReturnValueOnce(
        createMockDbQuery([
          {
            id: 'db_user_123',
            isPro: true,
            plan: 'pro',
            stripeCustomerId: 'cus_123',
            stripeSubscriptionId: 'sub_123',
            billingVersion: 2,
            lastBillingEventAt: null,
          },
        ])
      );

    const result = await fetchUserBillingDataWithAuth({
      fields: BILLING_FIELDS_STATUS,
    });

    expect(result.success).toBe(true);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
  });

  it('does not retry when billing lookup reports user not found', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_789' });
    mockDbSelect.mockReturnValueOnce(createMockDbQuery([]));

    const result = await fetchUserBillingDataWithAuth();

    expect(result).toEqual({ success: false, error: 'User not found' });
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockCaptureWarning).not.toHaveBeenCalledWith(
      'Billing data auth query failed after retry',
      null,
      expect.anything()
    );
  });
  it('captures warning when both attempts fail', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_456' });
    mockDbSelect
      .mockReturnValueOnce(createMockDbQueryRejecting(new Error('timeout')))
      .mockReturnValueOnce(
        createMockDbQueryRejecting(new Error('db unavailable'))
      );

    const result = await fetchUserBillingDataWithAuth();

    expect(result).toEqual({
      success: false,
      error: 'Failed to retrieve billing data',
    });
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Billing data auth query failed after retry',
      null,
      expect.objectContaining({
        clerkUserId: 'user_456',
        initialError: 'Failed to retrieve billing data',
        retryError: 'Failed to retrieve billing data',
      })
    );
  });
});

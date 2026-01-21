/**
 * Customer Sync Tests - Migration Fallback Behavior
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock calls
const { mockDbSelect, mockCaptureCriticalError } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock database schema
vi.mock('@/lib/db/schema', () => ({
  users: {
    id: Symbol('users.id'),
    clerkId: Symbol('users.clerkId'),
    email: Symbol('users.email'),
    isAdmin: Symbol('users.isAdmin'),
    isPro: Symbol('users.isPro'),
    stripeCustomerId: Symbol('users.stripeCustomerId'),
    stripeSubscriptionId: Symbol('users.stripeSubscriptionId'),
    billingVersion: Symbol('users.billingVersion'),
    lastBillingEventAt: Symbol('users.lastBillingEventAt'),
  },
  billingAuditLog: {
    id: Symbol('billingAuditLog.id'),
  },
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', left: a, right: b })),
  and: vi.fn((...args) => ({ type: 'and', conditions: args })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

// Import module once after mocks are set up
import {
  BILLING_FIELDS_STATUS,
  fetchUserBillingData,
} from '@/lib/stripe/customer-sync';

describe('fetchUserBillingData - Migration Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('migration fallback behavior', () => {
    it('falls back to legacy fields when is_admin column is missing (code 42703)', async () => {
      const missingColumnError = Object.assign(
        new Error('column users.is_admin does not exist'),
        { code: '42703' }
      );

      const legacyUserData = {
        id: 'legacy-user-id',
        email: 'legacy@example.com',
        isPro: true,
        stripeCustomerId: 'cus_legacy',
        stripeSubscriptionId: 'sub_legacy',
      };

      // First call fails with missing column error
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(missingColumnError),
          }),
        }),
      });

      // Second call (legacy fallback) succeeds
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([legacyUserData]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_legacy_user',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'legacy-user-id',
        email: 'legacy@example.com',
        isPro: true,
        // Default values for missing new columns
        isAdmin: false,
        billingVersion: 1,
        lastBillingEventAt: null,
      });
    });

    it('falls back to legacy fields when billing_version column is missing', async () => {
      const missingColumnError = Object.assign(
        new Error('column users.billing_version does not exist'),
        { code: '42703' }
      );

      const legacyUserData = {
        id: 'legacy-user-id-2',
        email: 'legacy2@example.com',
        isPro: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(missingColumnError),
          }),
        }),
      });

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([legacyUserData]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_legacy_user_2',
      });

      expect(result.success).toBe(true);
      expect(result.data?.billingVersion).toBe(1);
      expect(result.data?.isAdmin).toBe(false);
    });

    it('falls back when error message contains users.is_admin', async () => {
      const missingColumnError = new Error(
        'ERROR: column users.is_admin does not exist'
      );

      const legacyUserData = {
        id: 'legacy-user-id-3',
        email: 'legacy3@example.com',
        isPro: true,
        stripeCustomerId: 'cus_legacy_3',
        stripeSubscriptionId: 'sub_legacy_3',
      };

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(missingColumnError),
          }),
        }),
      });

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([legacyUserData]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_legacy_user_3',
      });

      expect(result.success).toBe(true);
      expect(result.data?.isAdmin).toBe(false);
    });

    it('returns user not found in legacy fallback when user does not exist', async () => {
      const missingColumnError = Object.assign(
        new Error('column users.is_admin does not exist'),
        { code: '42703' }
      );

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(missingColumnError),
          }),
        }),
      });

      // Legacy query returns empty
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'nonexistent_legacy_user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('does not fall back for unrelated database errors', async () => {
      const unrelatedError = new Error('Connection pool exhausted');

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(unrelatedError),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_unrelated_error',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve billing data');
      // Should only call db.select once (no fallback)
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });

    it('adds default values only for requested fields in fallback', async () => {
      const missingColumnError = Object.assign(
        new Error('column users.is_admin does not exist'),
        { code: '42703' }
      );

      const legacyUserData = {
        id: 'legacy-user-id-4',
        isPro: true,
        stripeCustomerId: 'cus_legacy_4',
        stripeSubscriptionId: 'sub_legacy_4',
      };

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(missingColumnError),
          }),
        }),
      });

      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([legacyUserData]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_legacy_status',
        fields: BILLING_FIELDS_STATUS,
      });

      expect(result.success).toBe(true);
      // BILLING_FIELDS_STATUS includes billingVersion and lastBillingEventAt but not isAdmin
      expect(result.data?.billingVersion).toBe(1);
      expect(result.data?.lastBillingEventAt).toBeNull();
      // isAdmin is not in BILLING_FIELDS_STATUS so should not be added
      expect(result.data).not.toHaveProperty('isAdmin');
    });
  });
});

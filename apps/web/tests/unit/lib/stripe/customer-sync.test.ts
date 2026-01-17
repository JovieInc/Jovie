/**
 * Unit Tests for fetchUserBillingData
 *
 * Tests the consolidated billing query function covering:
 * - Successful queries with all fields
 * - Selective field retrieval
 * - User not found scenarios
 * - Database error handling
 * - Migration fallback behavior
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

// Mock database schema - provide the users table columns
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

// Mock server-only (no-op in tests)
vi.mock('server-only', () => ({}));

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(),
}));

// Mock Stripe client
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    customers: {
      retrieve: vi.fn(),
      update: vi.fn(),
    },
  },
  getOrCreateCustomer: vi.fn(),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', left: a, right: b })),
  and: vi.fn((...args) => ({ type: 'and', conditions: args })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

// Import module once after mocks are set up (hoisted mocks ensure this works)
import {
  BILLING_FIELDS_CUSTOMER,
  BILLING_FIELDS_FULL,
  BILLING_FIELDS_STATUS,
  fetchUserBillingData,
} from '@/lib/stripe/customer-sync';

describe('fetchUserBillingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful queries', () => {
    it('returns all fields with default field selection (BILLING_FIELDS_FULL)', async () => {
      const mockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: true,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_456',
        billingVersion: 2,
        lastBillingEventAt: new Date('2024-01-15'),
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_user_123',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
      expect(result.error).toBeUndefined();
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });

    it('returns all fields with explicit BILLING_FIELDS_FULL', async () => {
      const mockUser = {
        id: 'user-uuid-456',
        email: 'pro@example.com',
        isAdmin: true,
        isPro: true,
        stripeCustomerId: 'cus_789',
        stripeSubscriptionId: 'sub_012',
        billingVersion: 5,
        lastBillingEventAt: new Date('2024-02-20'),
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_user_456',
        fields: BILLING_FIELDS_FULL,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
      expect(result.error).toBeUndefined();
    });

    it('returns admin user data correctly', async () => {
      const mockAdminUser = {
        id: 'admin-uuid',
        email: 'admin@example.com',
        isAdmin: true,
        isPro: true,
        stripeCustomerId: 'cus_admin',
        stripeSubscriptionId: 'sub_admin',
        billingVersion: 1,
        lastBillingEventAt: null,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAdminUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_admin',
      });

      expect(result.success).toBe(true);
      expect(result.data?.isAdmin).toBe(true);
      expect(result.data?.isPro).toBe(true);
    });

    it('returns free user data correctly', async () => {
      const mockFreeUser = {
        id: 'free-uuid',
        email: 'free@example.com',
        isAdmin: false,
        isPro: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingVersion: 1,
        lastBillingEventAt: null,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockFreeUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_free',
      });

      expect(result.success).toBe(true);
      expect(result.data?.isPro).toBe(false);
      expect(result.data?.stripeCustomerId).toBeNull();
      expect(result.data?.stripeSubscriptionId).toBeNull();
    });
  });

  describe('selective field retrieval', () => {
    it('returns only status fields with BILLING_FIELDS_STATUS', async () => {
      const mockStatusFields = {
        id: 'user-uuid-status',
        isPro: true,
        stripeCustomerId: 'cus_status',
        stripeSubscriptionId: 'sub_status',
        billingVersion: 3,
        lastBillingEventAt: new Date('2024-03-01'),
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockStatusFields]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_status_user',
        fields: BILLING_FIELDS_STATUS,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatusFields);
      // BILLING_FIELDS_STATUS should not include email or isAdmin
      expect(result.data).not.toHaveProperty('email');
      expect(result.data).not.toHaveProperty('isAdmin');
    });

    it('returns only customer fields with BILLING_FIELDS_CUSTOMER', async () => {
      const mockCustomerFields = {
        id: 'user-uuid-customer',
        email: 'customer@example.com',
        stripeCustomerId: 'cus_customer',
        billingVersion: 1,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCustomerFields]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_customer_user',
        fields: BILLING_FIELDS_CUSTOMER,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCustomerFields);
      // BILLING_FIELDS_CUSTOMER should not include isPro, isAdmin, etc
      expect(result.data).not.toHaveProperty('isPro');
      expect(result.data).not.toHaveProperty('isAdmin');
      expect(result.data).not.toHaveProperty('stripeSubscriptionId');
    });

    it('returns custom field selection', async () => {
      const mockCustomFields = {
        id: 'user-uuid-custom',
        isPro: true,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCustomFields]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_custom_user',
        fields: ['id', 'isPro'] as const,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCustomFields);
      expect(result.data).not.toHaveProperty('email');
      expect(result.data).not.toHaveProperty('stripeCustomerId');
    });

    it('returns single field selection', async () => {
      const mockSingleField = {
        isPro: false,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSingleField]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_single_field',
        fields: ['isPro'] as const,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSingleField);
    });
  });

  describe('user not found', () => {
    it('returns error when user does not exist', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'nonexistent_user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
      expect(result.data).toBeUndefined();
    });

    it('returns error when user does not exist with custom field selection', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'nonexistent_status_user',
        fields: BILLING_FIELDS_STATUS,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('database error handling', () => {
    it('returns error and captures on generic database error', async () => {
      const dbError = new Error('Connection refused');

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(dbError),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_db_error',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve billing data');
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Error fetching user billing data',
        dbError,
        expect.objectContaining({
          clerkUserId: 'clerk_db_error',
          function: 'fetchUserBillingData',
        })
      );
    });

    it('returns error and captures on timeout error', async () => {
      const timeoutError = new Error('Query timeout');

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(timeoutError),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_timeout',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve billing data');
      expect(mockCaptureCriticalError).toHaveBeenCalled();
    });

    it('includes field selection in error context', async () => {
      const dbError = new Error('Database error');

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(dbError),
          }),
        }),
      });

      await fetchUserBillingData({
        clerkUserId: 'clerk_error_with_fields',
        fields: BILLING_FIELDS_STATUS,
      });

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Error fetching user billing data',
        dbError,
        expect.objectContaining({
          fields: expect.stringContaining('id'),
          function: 'fetchUserBillingData',
        })
      );
    });
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

  describe('edge cases', () => {
    it('handles null email correctly', async () => {
      const mockUser = {
        id: 'user-null-email',
        email: null,
        isAdmin: false,
        isPro: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingVersion: 1,
        lastBillingEventAt: null,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_null_email',
      });

      expect(result.success).toBe(true);
      expect(result.data?.email).toBeNull();
    });

    it('handles null isPro correctly', async () => {
      const mockUser = {
        id: 'user-null-ispro',
        email: 'test@example.com',
        isAdmin: false,
        isPro: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingVersion: 1,
        lastBillingEventAt: null,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_null_ispro',
      });

      expect(result.success).toBe(true);
      expect(result.data?.isPro).toBeNull();
    });

    it('handles Date objects for lastBillingEventAt', async () => {
      const testDate = new Date('2024-06-15T10:30:00Z');
      const mockUser = {
        id: 'user-with-date',
        email: 'test@example.com',
        isAdmin: false,
        isPro: true,
        stripeCustomerId: 'cus_date',
        stripeSubscriptionId: 'sub_date',
        billingVersion: 5,
        lastBillingEventAt: testDate,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_with_date',
      });

      expect(result.success).toBe(true);
      expect(result.data?.lastBillingEventAt).toEqual(testDate);
    });

    it('handles high billing version numbers', async () => {
      const mockUser = {
        id: 'user-high-version',
        email: 'test@example.com',
        isAdmin: false,
        isPro: true,
        stripeCustomerId: 'cus_high',
        stripeSubscriptionId: 'sub_high',
        billingVersion: 9999,
        lastBillingEventAt: new Date(),
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await fetchUserBillingData({
        clerkUserId: 'clerk_high_version',
      });

      expect(result.success).toBe(true);
      expect(result.data?.billingVersion).toBe(9999);
    });
  });
});

describe('field selection constants', () => {
  it('BILLING_FIELDS_FULL contains all 8 fields', () => {
    expect(BILLING_FIELDS_FULL).toContain('id');
    expect(BILLING_FIELDS_FULL).toContain('email');
    expect(BILLING_FIELDS_FULL).toContain('isAdmin');
    expect(BILLING_FIELDS_FULL).toContain('isPro');
    expect(BILLING_FIELDS_FULL).toContain('stripeCustomerId');
    expect(BILLING_FIELDS_FULL).toContain('stripeSubscriptionId');
    expect(BILLING_FIELDS_FULL).toContain('billingVersion');
    expect(BILLING_FIELDS_FULL).toContain('lastBillingEventAt');
    expect(BILLING_FIELDS_FULL).toHaveLength(8);
  });

  it('BILLING_FIELDS_STATUS contains 6 fields without email/isAdmin', () => {
    expect(BILLING_FIELDS_STATUS).toContain('id');
    expect(BILLING_FIELDS_STATUS).toContain('isPro');
    expect(BILLING_FIELDS_STATUS).toContain('stripeCustomerId');
    expect(BILLING_FIELDS_STATUS).toContain('stripeSubscriptionId');
    expect(BILLING_FIELDS_STATUS).toContain('billingVersion');
    expect(BILLING_FIELDS_STATUS).toContain('lastBillingEventAt');
    expect(BILLING_FIELDS_STATUS).not.toContain('email');
    expect(BILLING_FIELDS_STATUS).not.toContain('isAdmin');
    expect(BILLING_FIELDS_STATUS).toHaveLength(6);
  });

  it('BILLING_FIELDS_CUSTOMER contains 4 fields for Stripe operations', () => {
    expect(BILLING_FIELDS_CUSTOMER).toContain('id');
    expect(BILLING_FIELDS_CUSTOMER).toContain('email');
    expect(BILLING_FIELDS_CUSTOMER).toContain('stripeCustomerId');
    expect(BILLING_FIELDS_CUSTOMER).toContain('billingVersion');
    expect(BILLING_FIELDS_CUSTOMER).not.toContain('isPro');
    expect(BILLING_FIELDS_CUSTOMER).not.toContain('isAdmin');
    expect(BILLING_FIELDS_CUSTOMER).not.toContain('stripeSubscriptionId');
    expect(BILLING_FIELDS_CUSTOMER).not.toContain('lastBillingEventAt');
    expect(BILLING_FIELDS_CUSTOMER).toHaveLength(4);
  });
});

describe('UserBillingFields type exports', () => {
  it('exports expected functions and constants', () => {
    // Verify exports are available (imported at top level)
    expect(BILLING_FIELDS_FULL).toBeDefined();
    expect(BILLING_FIELDS_STATUS).toBeDefined();
    expect(BILLING_FIELDS_CUSTOMER).toBeDefined();
    expect(fetchUserBillingData).toBeDefined();
  });
});

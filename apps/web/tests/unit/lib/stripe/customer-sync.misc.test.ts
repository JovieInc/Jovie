/**
 * Customer Sync Tests - Edge Cases, Constants, & Type Exports
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
  BILLING_FIELDS_CUSTOMER,
  BILLING_FIELDS_FULL,
  BILLING_FIELDS_STATUS,
  fetchUserBillingData,
} from '@/lib/stripe/customer-sync';

describe('fetchUserBillingData - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

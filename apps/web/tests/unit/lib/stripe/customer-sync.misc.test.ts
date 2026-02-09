/**
 * Customer Sync Tests - Edge Cases, Constants, & Type Exports
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockBillingAuditLog,
  mockCaptureCriticalError,
  mockDb,
  mockDbSelect,
  mockUsersTable,
} from './customer-sync.test-utils';

// vi.mock calls must be in the test file itself for proper hoisting
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
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ withDbSession: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { customers: { retrieve: vi.fn(), update: vi.fn() } },
  getOrCreateCustomer: vi.fn(),
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', left: a, right: b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
  sql: vi.fn((strings: unknown, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}));

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
  it('BILLING_FIELDS_FULL contains all fields', () => {
    expect(BILLING_FIELDS_FULL).toContain('id');
    expect(BILLING_FIELDS_FULL).toContain('email');
    expect(BILLING_FIELDS_FULL).toContain('isAdmin');
    expect(BILLING_FIELDS_FULL).toContain('isPro');
    expect(BILLING_FIELDS_FULL).toContain('plan');
    expect(BILLING_FIELDS_FULL).toContain('stripeCustomerId');
    expect(BILLING_FIELDS_FULL).toContain('stripeSubscriptionId');
    expect(BILLING_FIELDS_FULL).toContain('billingVersion');
    expect(BILLING_FIELDS_FULL).toContain('lastBillingEventAt');
    expect(BILLING_FIELDS_FULL).toHaveLength(9);
  });

  it('BILLING_FIELDS_STATUS contains fields without email/isAdmin', () => {
    expect(BILLING_FIELDS_STATUS).toContain('id');
    expect(BILLING_FIELDS_STATUS).toContain('isPro');
    expect(BILLING_FIELDS_STATUS).toContain('plan');
    expect(BILLING_FIELDS_STATUS).toContain('stripeCustomerId');
    expect(BILLING_FIELDS_STATUS).toContain('stripeSubscriptionId');
    expect(BILLING_FIELDS_STATUS).toContain('billingVersion');
    expect(BILLING_FIELDS_STATUS).toContain('lastBillingEventAt');
    expect(BILLING_FIELDS_STATUS).not.toContain('email');
    expect(BILLING_FIELDS_STATUS).not.toContain('isAdmin');
    expect(BILLING_FIELDS_STATUS).toHaveLength(7);
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

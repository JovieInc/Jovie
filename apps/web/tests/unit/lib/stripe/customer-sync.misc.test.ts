/**
 * Customer Sync Tests - Edge Cases, Constants, & Type Exports
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDbSelect } from './customer-sync.test-utils';

let fetchUserBillingData: typeof import('@/lib/stripe/customer-sync').fetchUserBillingData;
let BILLING_FIELDS_FULL: typeof import('@/lib/stripe/customer-sync').BILLING_FIELDS_FULL;
let BILLING_FIELDS_STATUS: typeof import('@/lib/stripe/customer-sync').BILLING_FIELDS_STATUS;
let BILLING_FIELDS_CUSTOMER: typeof import('@/lib/stripe/customer-sync').BILLING_FIELDS_CUSTOMER;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('@/lib/stripe/customer-sync');
  fetchUserBillingData = mod.fetchUserBillingData;
  BILLING_FIELDS_FULL = mod.BILLING_FIELDS_FULL;
  BILLING_FIELDS_STATUS = mod.BILLING_FIELDS_STATUS;
  BILLING_FIELDS_CUSTOMER = mod.BILLING_FIELDS_CUSTOMER;
});

describe('fetchUserBillingData - Edge Cases', () => {
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

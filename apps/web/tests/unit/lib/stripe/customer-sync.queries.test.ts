/**
 * Customer Sync Tests - Successful Queries & Selective Field Retrieval
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import module once after mocks are set up
import {
  BILLING_FIELDS_CUSTOMER,
  BILLING_FIELDS_FULL,
  BILLING_FIELDS_STATUS,
  fetchUserBillingData,
} from '@/lib/stripe/customer-sync';
import { mockDbSelect } from './customer-sync.test-utils';

describe('fetchUserBillingData - Queries', () => {
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
});

/**
 * Customer Sync Tests - User Not Found & Database Error Handling
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_FIELDS_STATUS,
  fetchUserBillingData,
} from '@/lib/stripe/customer-sync';
// IMPORTANT: Import mocks before importing module-under-test
import {
  mockCaptureCriticalError,
  mockDbSelect,
} from './customer-sync.test-utils';

describe('fetchUserBillingData - Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const { mockDb, mockCaptureWarning, mockRevalidatePath } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockCaptureWarning: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema', () => ({
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

// Import after mocks
import {
  getCustomerId,
  getStripeObjectId,
  getUserIdFromStripeCustomer,
  invalidateBillingCache,
  stripeTimestampToDate,
} from '@/lib/stripe/webhooks/utils';

describe('Stripe webhook utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStripeObjectId', () => {
    it('extracts id from subscription event', () => {
      const event = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123abc',
            status: 'active',
          },
        },
      } as Stripe.Event;

      expect(getStripeObjectId(event)).toBe('sub_123abc');
    });

    it('extracts id from checkout session event', () => {
      const event = {
        id: 'evt_456',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_789',
            customer: 'cus_123',
          },
        },
      } as Stripe.Event;

      expect(getStripeObjectId(event)).toBe('cs_test_789');
    });

    it('extracts id from invoice event', () => {
      const event = {
        id: 'evt_invoice',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_123xyz',
            customer: 'cus_456',
          },
        },
      } as Stripe.Event;

      expect(getStripeObjectId(event)).toBe('in_123xyz');
    });

    it('returns null when data.object is undefined', () => {
      const event = {
        id: 'evt_no_object',
        type: 'some.event',
        data: {},
      } as unknown as Stripe.Event;

      expect(getStripeObjectId(event)).toBeNull();
    });

    it('returns null when data.object has no id', () => {
      const event = {
        id: 'evt_no_id',
        type: 'some.event',
        data: {
          object: {
            status: 'active',
          },
        },
      } as unknown as Stripe.Event;

      expect(getStripeObjectId(event)).toBeNull();
    });

    it('returns null when id is not a string', () => {
      const event = {
        id: 'evt_wrong_type',
        type: 'some.event',
        data: {
          object: {
            id: 12345,
          },
        },
      } as unknown as Stripe.Event;

      expect(getStripeObjectId(event)).toBeNull();
    });

    it('returns null when id is empty string', () => {
      const event = {
        id: 'evt_empty_id',
        type: 'some.event',
        data: {
          object: {
            id: '',
          },
        },
      } as unknown as Stripe.Event;

      expect(getStripeObjectId(event)).toBeNull();
    });
  });

  describe('stripeTimestampToDate', () => {
    it('converts Unix timestamp to Date', () => {
      const timestamp = 1640000000; // 2021-12-20T11:33:20.000Z
      const date = stripeTimestampToDate(timestamp);

      expect(date.toISOString()).toBe('2021-12-20T11:33:20.000Z');
    });

    it('converts current timestamp correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const date = stripeTimestampToDate(now);

      // Should be within 1 second of current time
      const diff = Math.abs(date.getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });

    it('handles epoch (0) timestamp', () => {
      const date = stripeTimestampToDate(0);
      expect(date.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('handles future timestamps', () => {
      const futureTimestamp = 2000000000; // 2033-05-18T03:33:20.000Z
      const date = stripeTimestampToDate(futureTimestamp);

      expect(date.toISOString()).toBe('2033-05-18T03:33:20.000Z');
    });
  });

  describe('getCustomerId', () => {
    it('returns string customer ID directly', () => {
      expect(getCustomerId('cus_123abc')).toBe('cus_123abc');
    });

    it('extracts id from expanded Customer object', () => {
      const customer = {
        id: 'cus_expanded',
        object: 'customer',
        email: 'test@example.com',
        name: 'Test User',
      } as Stripe.Customer;

      expect(getCustomerId(customer)).toBe('cus_expanded');
    });

    it('extracts id from DeletedCustomer object', () => {
      const deletedCustomer = {
        id: 'cus_deleted',
        object: 'customer',
        deleted: true,
      } as Stripe.DeletedCustomer;

      expect(getCustomerId(deletedCustomer)).toBe('cus_deleted');
    });

    it('returns null for null customer', () => {
      expect(getCustomerId(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      // Test with explicit undefined cast to simulate edge case
      expect(getCustomerId(undefined as unknown as null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getCustomerId('')).toBeNull();
    });

    it('returns null for object without id', () => {
      const malformedCustomer = {
        email: 'test@example.com',
      } as unknown as Stripe.Customer;

      expect(getCustomerId(malformedCustomer)).toBeNull();
    });
  });

  describe('getUserIdFromStripeCustomer', () => {
    it('returns clerk user id when found in database', async () => {
      // Setup mock chain
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ clerkId: 'user_abc123' }]),
          }),
        }),
      });

      const result = await getUserIdFromStripeCustomer('cus_123');

      expect(result).toBe('user_abc123');
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('returns null when user not found', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await getUserIdFromStripeCustomer('cus_unknown');

      expect(result).toBeNull();
    });

    it('returns null when user has no clerkId', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ clerkId: null }]),
          }),
        }),
      });

      const result = await getUserIdFromStripeCustomer('cus_no_clerk');

      expect(result).toBeNull();
    });

    it('returns null and captures warning on database error', async () => {
      const dbError = new Error('Database connection failed');

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(dbError),
          }),
        }),
      });

      const result = await getUserIdFromStripeCustomer('cus_error');

      expect(result).toBeNull();
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        'Failed to lookup user by Stripe customer ID in fallback',
        dbError,
        {
          function: 'getUserIdFromStripeCustomer',
          route: '/api/stripe/webhooks',
        }
      );
    });
  });

  describe('invalidateBillingCache', () => {
    it('revalidates all billing-related paths', async () => {
      await invalidateBillingCache();

      expect(mockRevalidatePath).toHaveBeenCalledTimes(3);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/billing');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings');
    });

    it('can be called multiple times', async () => {
      await invalidateBillingCache();
      await invalidateBillingCache();

      expect(mockRevalidatePath).toHaveBeenCalledTimes(6);
    });
  });
});

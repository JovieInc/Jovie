/**
 * Payment Handler Tests - Misc
 */
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStripeSubscriptionsRetrieve,
  mockGetUserIdFromStripeCustomer,
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  mockGetPlanFromPriceId,
  mockCaptureCriticalError,
  mockLogFallback,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockGetUserIdFromStripeCustomer: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockGetPlanFromPriceId: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
  mockLogFallback: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  },
}));

vi.mock('@/lib/stripe/webhooks/utils', () => ({
  getUserIdFromStripeCustomer: mockGetUserIdFromStripeCustomer,
  invalidateBillingCache: mockInvalidateBillingCache,
  isActiveSubscription: (status: Stripe.Subscription.Status) =>
    status === 'active' || status === 'trialing',
  getCustomerId: (customer: string | { id: string } | null) => {
    if (!customer) return null;
    if (typeof customer === 'string') return customer;
    return customer.id;
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  logFallback: mockLogFallback,
}));

import {
  PaymentHandler,
  paymentHandler,
} from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('@critical PaymentHandler - misc', () => {
  let handler: PaymentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PaymentHandler();

    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('eventTypes', () => {
    it('handles both payment event types', () => {
      expect(handler.eventTypes).toContain('invoice.payment_succeeded');
      expect(handler.eventTypes).toContain('invoice.payment_failed');
      expect(handler.eventTypes).toHaveLength(2);
    });
  });

  describe('handle - unhandled event type', () => {
    it('returns skipped for unhandled event types', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_unhandled',
          type: 'invoice.created' as Stripe.Event.Type,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_unhandled',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_unhandled',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('unhandled_event_type');
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
    });
  });

  describe('handle - billing cache invalidation', () => {
    it('invalidates billing cache after successful payment succeeded', async () => {
      const mockSubscription = {
        id: 'sub_cache',
        status: 'active',
        customer: 'cus_cache',
        metadata: { clerk_user_id: 'user_cache' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_cache',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_cache',
              customer: 'cus_cache',
              subscription: 'sub_cache',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });

    it('invalidates billing cache after payment failed downgrade', async () => {
      const mockSubscription = {
        id: 'sub_cache_fail',
        status: 'past_due',
        customer: 'cus_cache_fail',
        metadata: { clerk_user_id: 'user_cache_fail' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_cache_fail',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_cache_fail',
              customer: 'cus_cache_fail',
              subscription: 'sub_cache_fail',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache_fail',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton instance', () => {
    it('exports a singleton handler instance', () => {
      expect(paymentHandler).toBeInstanceOf(PaymentHandler);
      expect(paymentHandler.eventTypes).toContain('invoice.payment_succeeded');
      expect(paymentHandler.eventTypes).toContain('invoice.payment_failed');
    });
  });
});

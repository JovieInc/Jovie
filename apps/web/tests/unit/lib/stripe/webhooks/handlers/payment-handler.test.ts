/**
 * Payment Handler Tests
 *
 * Tests for the PaymentHandler which processes
 * invoice.payment_succeeded and invoice.payment_failed webhook events.
 */

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock calls
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

// Import after mocks are set up
import {
  PaymentHandler,
  paymentHandler,
} from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('PaymentHandler', () => {
  let handler: PaymentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PaymentHandler();

    // Default mock implementations
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
  });

  describe('eventTypes', () => {
    it('handles both payment event types', () => {
      expect(handler.eventTypes).toContain('invoice.payment_succeeded');
      expect(handler.eventTypes).toContain('invoice.payment_failed');
      expect(handler.eventTypes).toHaveLength(2);
    });
  });

  describe('handle - payment succeeded', () => {
    it('processes payment succeeded with user ID in subscription metadata', async () => {
      const mockSubscription = {
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123',
        metadata: { clerk_user_id: 'user_abc123' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_payment_123',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_payment_123',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_abc123',
          isPro: true,
          stripeSubscriptionId: 'sub_123',
          eventType: 'payment_succeeded',
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalled();
    });

    it('handles invoice with expanded subscription object', async () => {
      const mockSubscription = {
        id: 'sub_expanded',
        status: 'active',
        customer: 'cus_456',
        metadata: { clerk_user_id: 'user_def456' },
        items: { data: [{ price: { id: 'price_pro_yearly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_payment_expanded',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_expanded',
              customer: 'cus_456',
              subscription: { id: 'sub_expanded' }, // Expanded subscription object
              amount_due: 20000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_payment_expanded',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_expanded'
      );
    });

    it('skips processing for invoices without subscription (one-time payment)', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_onetime',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_onetime',
              customer: 'cus_123',
              subscription: null, // No subscription
              amount_due: 5000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_onetime',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('invoice_has_no_subscription');

      // Should not retrieve subscription or update billing
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
    });

    it('skips processing when no user ID in subscription metadata', async () => {
      const mockSubscription = {
        id: 'sub_no_meta',
        status: 'active',
        customer: 'cus_789',
        metadata: {}, // No clerk_user_id
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_meta',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_no_meta',
              customer: 'cus_789',
              subscription: 'sub_no_meta',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_meta',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      // Payment succeeded is less critical - skips without throwing
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('no_user_id_in_subscription_metadata');

      // Should not attempt fallback lookup or update billing
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockStripeSubscriptionsRetrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      const context: WebhookContext = {
        event: {
          id: 'evt_error',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_error',
              customer: 'cus_error',
              subscription: 'sub_error',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_error',
        stripeEventTimestamp: new Date(),
      };

      // Should not throw - payment succeeded errors are handled gracefully
      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('error_processing_payment_success');
      expect(result.error).toBe('Stripe API error');

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Error handling payment success webhook',
        expect.any(Error),
        expect.objectContaining({
          invoiceId: 'in_error',
          route: '/api/stripe/webhooks',
          event: 'invoice.payment_succeeded',
        })
      );
    });

    it('processes trialing subscription status', async () => {
      const mockSubscription = {
        id: 'sub_trial',
        status: 'trialing',
        customer: 'cus_trial',
        metadata: { clerk_user_id: 'user_trial' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_trial',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_trial',
              customer: 'cus_trial',
              subscription: 'sub_trial',
              amount_due: 0,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_trial',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          isPro: true,
        })
      );
    });
  });

  describe('handle - payment failed', () => {
    it('logs payment failure and skips when subscription is not in failure status', async () => {
      const mockSubscription = {
        id: 'sub_active',
        status: 'active', // Not a failure status
        customer: 'cus_active',
        metadata: { clerk_user_id: 'user_active' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_active',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_active',
              customer: 'cus_active',
              subscription: 'sub_active',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_active',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('subscription_not_in_failure_status');

      // Should log the failure
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Payment failed for invoice',
        expect.any(Error),
        expect.objectContaining({
          invoiceId: 'in_fail_active',
          amountDue: 2000,
          attemptCount: 1,
        })
      );

      // Should not downgrade user
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('downgrades user when subscription is past_due', async () => {
      const mockSubscription = {
        id: 'sub_past_due',
        status: 'past_due',
        customer: 'cus_past_due',
        metadata: { clerk_user_id: 'user_past_due' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_past_due',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_past_due',
              customer: 'cus_past_due',
              subscription: 'sub_past_due',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_past_due',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_past_due',
          isPro: false,
          stripeSubscriptionId: null,
          eventType: 'payment_failed',
          metadata: expect.objectContaining({
            subscriptionStatus: 'past_due',
            invoiceId: 'in_fail_past_due',
            amountDue: 2000,
            attemptCount: 2,
          }),
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalled();
    });

    it('downgrades user when subscription is unpaid', async () => {
      const mockSubscription = {
        id: 'sub_unpaid',
        status: 'unpaid',
        customer: 'cus_unpaid',
        metadata: { clerk_user_id: 'user_unpaid' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_unpaid',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_unpaid',
              customer: 'cus_unpaid',
              subscription: 'sub_unpaid',
              amount_due: 2000,
              attempt_count: 4,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_unpaid',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_unpaid',
          isPro: false,
          metadata: expect.objectContaining({
            subscriptionStatus: 'unpaid',
          }),
        })
      );
    });

    it('downgrades user when subscription is incomplete', async () => {
      const mockSubscription = {
        id: 'sub_incomplete',
        status: 'incomplete',
        customer: 'cus_incomplete',
        metadata: { clerk_user_id: 'user_incomplete' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_incomplete',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_incomplete',
              customer: 'cus_incomplete',
              subscription: 'sub_incomplete',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_incomplete',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          isPro: false,
          metadata: expect.objectContaining({
            subscriptionStatus: 'incomplete',
          }),
        })
      );
    });

    it('downgrades user when subscription is incomplete_expired', async () => {
      const mockSubscription = {
        id: 'sub_incomplete_expired',
        status: 'incomplete_expired',
        customer: 'cus_incomplete_expired',
        metadata: { clerk_user_id: 'user_incomplete_expired' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_expired',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_expired',
              customer: 'cus_incomplete_expired',
              subscription: 'sub_incomplete_expired',
              amount_due: 2000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_expired',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          isPro: false,
          metadata: expect.objectContaining({
            subscriptionStatus: 'incomplete_expired',
          }),
        })
      );
    });

    it('skips processing for invoices without subscription', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_fail_no_sub',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_no_sub',
              customer: 'cus_123',
              subscription: null, // No subscription
              amount_due: 5000,
              attempt_count: 1,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_no_sub',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('invoice_has_no_subscription');

      // Should still log the failure
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Payment failed for invoice',
        expect.any(Error),
        expect.objectContaining({
          invoiceId: 'in_fail_no_sub',
        })
      );

      // Should not retrieve subscription
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    });

    it('skips processing when user cannot be identified', async () => {
      const mockSubscription = {
        id: 'sub_no_user',
        status: 'past_due',
        customer: 'cus_unknown',
        metadata: {}, // No clerk_user_id
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_no_user',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_no_user',
              customer: 'cus_unknown',
              subscription: 'sub_no_user',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_no_user',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cannot_identify_user_for_payment_failure');

      // Should attempt fallback lookup
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith(
        'cus_unknown'
      );

      // Should not downgrade
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('falls back to customer ID lookup when metadata is missing', async () => {
      const mockSubscription = {
        id: 'sub_fallback',
        status: 'past_due',
        customer: 'cus_fallback',
        metadata: {}, // No clerk_user_id
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_from_db');

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_fallback',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_fallback',
              customer: 'cus_fallback',
              subscription: 'sub_fallback',
              amount_due: 2000,
              attempt_count: 3,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_fallback',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockLogFallback).toHaveBeenCalledWith(
        'No user ID in subscription metadata for payment failure',
        expect.objectContaining({ event: 'invoice.payment_failed' })
      );
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith(
        'cus_fallback'
      );
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_from_db',
          isPro: false,
        })
      );
    });

    it('throws error when billing update fails', async () => {
      const mockSubscription = {
        id: 'sub_fail_update',
        status: 'past_due',
        customer: 'cus_fail_update',
        metadata: { clerk_user_id: 'user_fail_update' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockUpdateUserBillingStatus.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_update',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_update',
              customer: 'cus_fail_update',
              subscription: 'sub_fail_update',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_update',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Failed to downgrade user: Database error'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Failed to downgrade user after payment failure',
        expect.any(Error),
        expect.objectContaining({
          userId: 'user_fail_update',
          subscriptionStatus: 'past_due',
          route: '/api/stripe/webhooks',
          event: 'invoice.payment_failed',
        })
      );
    });

    it('handles expanded subscription object in invoice', async () => {
      const mockSubscription = {
        id: 'sub_expanded_fail',
        status: 'past_due',
        customer: 'cus_expanded_fail',
        metadata: { clerk_user_id: 'user_expanded_fail' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_expanded',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_expanded',
              customer: 'cus_expanded_fail',
              subscription: { id: 'sub_expanded_fail' }, // Expanded subscription
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_expanded',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_expanded_fail'
      );
    });

    it('propagates skipped result from billing update', async () => {
      const mockSubscription = {
        id: 'sub_skipped',
        status: 'past_due',
        customer: 'cus_skipped',
        metadata: { clerk_user_id: 'user_skipped' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockUpdateUserBillingStatus.mockResolvedValue({
        success: true,
        skipped: true,
        reason: 'stale_event',
      });

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_skipped',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_skipped',
              customer: 'cus_skipped',
              subscription: 'sub_skipped',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_skipped',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('stale_event');
    });

    it('skips fallback when customer is not a string', async () => {
      const mockSubscription = {
        id: 'sub_expanded_customer',
        status: 'past_due',
        customer: { id: 'cus_expanded' } as Stripe.Customer, // Expanded customer
        metadata: {},
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail_expanded_customer',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail_expanded_customer',
              customer: { id: 'cus_expanded' },
              subscription: 'sub_expanded_customer',
              amount_due: 2000,
              attempt_count: 2,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail_expanded_customer',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cannot_identify_user_for_payment_failure');

      // Should not attempt fallback lookup with expanded customer
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
    });
  });

  describe('handle - unhandled event type', () => {
    it('returns skipped for unhandled event types', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_unhandled',
          type: 'invoice.created' as any, // Not a handled type
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

      // Should not process anything
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

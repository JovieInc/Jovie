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
  mockRecordCommission,
  mockGetInternalUserId,
  mockSendPaymentFailedEmail,
  mockSendPaymentRecoveredEmail,
  mockShouldSendDunningEmail,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockGetUserIdFromStripeCustomer: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockGetPlanFromPriceId: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
  mockLogFallback: vi.fn(),
  mockRecordCommission: vi.fn(),
  mockGetInternalUserId: vi.fn(),
  mockSendPaymentFailedEmail: vi.fn(),
  mockSendPaymentRecoveredEmail: vi.fn(),
  mockShouldSendDunningEmail: vi.fn(),
  mockLoggerWarn: vi.fn(),
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

vi.mock('@/lib/referrals/service', () => ({
  recordCommission: mockRecordCommission,
  getInternalUserId: mockGetInternalUserId,
}));

vi.mock('@/lib/stripe/dunning', () => ({
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
  sendPaymentRecoveredEmail: mockSendPaymentRecoveredEmail,
  shouldSendDunningEmail: mockShouldSendDunningEmail,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  PaymentHandler,
  paymentHandler,
} from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('@critical PaymentHandler', () => {
  let handler: PaymentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PaymentHandler();

    // Default mock implementations
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
    mockGetInternalUserId.mockResolvedValue(null);
    mockRecordCommission.mockResolvedValue(undefined);
    mockSendPaymentFailedEmail.mockResolvedValue({ success: true });
    mockSendPaymentRecoveredEmail.mockResolvedValue({ success: true });
    mockShouldSendDunningEmail.mockReturnValue(false);
    mockCaptureCriticalError.mockResolvedValue(undefined);
  });

  describe('eventTypes', () => {
    it('handles invoice.payment_succeeded and invoice.payment_failed event types', () => {
      expect(handler.eventTypes).toContain('invoice.payment_succeeded');
      expect(handler.eventTypes).toContain('invoice.payment_failed');
      expect(handler.eventTypes).toHaveLength(2);
    });
  });

  describe('handle - event routing', () => {
    it('routes invoice.payment_succeeded to payment succeeded handler', async () => {
      const mockSubscription = {
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123',
        metadata: { clerk_user_id: 'user_abc' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_123',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_123',
              amount_paid: 1999,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 1,
              period_start: Math.floor(Date.now() / 1000),
              period_end: Math.floor(Date.now() / 1000) + 2592000,
              parent: {
                subscription_details: { subscription: 'sub_123' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_123',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    });

    it('routes invoice.payment_failed to payment failed handler', async () => {
      const mockSubscription = {
        id: 'sub_fail',
        status: 'active',
        customer: 'cus_123',
        metadata: { clerk_user_id: 'user_abc' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_fail',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fail',
              amount_paid: 0,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_fail' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fail',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      // Subscription is active so it's skipped (not in failure status)
      expect(result.success).toBe(true);
      expect(mockCaptureCriticalError).toHaveBeenCalled();
    });

    it('returns skipped for unknown event types', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_unknown',
          type: 'invoice.created' as Stripe.Event['type'],
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_unknown',
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_unknown',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('unhandled_event_type');
    });
  });

  describe('handlePaymentSucceeded', () => {
    it('restores pro access and updates billing status', async () => {
      const mockSubscription = {
        id: 'sub_success',
        status: 'active',
        customer: 'cus_456',
        metadata: { clerk_user_id: 'user_pro' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_success',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_success',
              amount_paid: 2999,
              amount_due: 2999,
              currency: 'usd',
              attempt_count: 1,
              period_start: 1700000000,
              period_end: 1702592000,
              parent: {
                subscription_details: { subscription: 'sub_success' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_success',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_pro',
          isPro: true,
          eventType: 'payment_succeeded',
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });

    it('records referral commission when amount_paid > 0', async () => {
      const mockSubscription = {
        id: 'sub_referral',
        status: 'active',
        customer: 'cus_ref',
        metadata: { clerk_user_id: 'user_referral' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetInternalUserId.mockResolvedValue('internal_123');

      const context: WebhookContext = {
        event: {
          id: 'evt_ref',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_ref',
              amount_paid: 1999,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 1,
              period_start: 1700000000,
              period_end: 1702592000,
              parent: {
                subscription_details: { subscription: 'sub_referral' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_ref',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockGetInternalUserId).toHaveBeenCalledWith('user_referral');
      expect(mockRecordCommission).toHaveBeenCalledWith(
        expect.objectContaining({
          referredUserId: 'internal_123',
          stripeInvoiceId: 'in_ref',
          paymentAmountCents: 1999,
          currency: 'usd',
        })
      );
    });

    it('skips commission recording when amount_paid is 0', async () => {
      const mockSubscription = {
        id: 'sub_zero',
        status: 'active',
        customer: 'cus_zero',
        metadata: { clerk_user_id: 'user_zero' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_zero',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_zero',
              amount_paid: 0,
              amount_due: 0,
              currency: 'usd',
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_zero' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_zero',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockGetInternalUserId).not.toHaveBeenCalled();
      expect(mockRecordCommission).not.toHaveBeenCalled();
    });

    it('sends recovery email when attempt_count > 1 (recovering from past_due)', async () => {
      const mockSubscription = {
        id: 'sub_recover',
        status: 'active',
        customer: 'cus_recover',
        metadata: { clerk_user_id: 'user_recover' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_recover',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_recover',
              amount_paid: 2999,
              amount_due: 2999,
              currency: 'usd',
              attempt_count: 3, // Multiple attempts = recovery
              period_start: 1700000000,
              period_end: 1702592000,
              parent: {
                subscription_details: { subscription: 'sub_recover' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_recover',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockSendPaymentRecoveredEmail).toHaveBeenCalledWith({
        userId: 'user_recover',
        amountPaid: 2999,
        currency: 'usd',
        priceId: 'price_pro',
      });
    });

    it('does not send recovery email on first attempt', async () => {
      const mockSubscription = {
        id: 'sub_first',
        status: 'active',
        customer: 'cus_first',
        metadata: { clerk_user_id: 'user_first' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_first',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_first',
              amount_paid: 2999,
              amount_due: 2999,
              currency: 'usd',
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_first' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_first',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockSendPaymentRecoveredEmail).not.toHaveBeenCalled();
    });

    it('skips when invoice has no subscription', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_nosub',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_nosub',
              amount_paid: 1999,
              parent: null,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_nosub',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('invoice_has_no_subscription');
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    });

    it('skips when subscription has no user ID in metadata', async () => {
      const mockSubscription = {
        id: 'sub_no_user',
        status: 'active',
        customer: 'cus_no_user',
        metadata: {},
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_user',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_no_user',
              amount_paid: 1999,
              parent: {
                subscription_details: { subscription: 'sub_no_user' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_user',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('no_user_id_in_subscription_metadata');
    });

    it('handles Stripe API error gracefully in payment succeeded', async () => {
      mockStripeSubscriptionsRetrieve.mockRejectedValue(
        new Error('Stripe API error')
      );

      const context: WebhookContext = {
        event: {
          id: 'evt_err',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_err',
              amount_paid: 1999,
              parent: {
                subscription_details: { subscription: 'sub_err' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_err',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('error_processing_payment_success');
      expect(result.error).toBe('Stripe API error');
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Error handling payment success webhook',
        expect.any(Error),
        expect.objectContaining({
          invoiceId: 'in_err',
          event: 'invoice.payment_succeeded',
        })
      );
    });
  });

  describe('handlePaymentFailed', () => {
    it('logs failure and skips when subscription is not in failure status', async () => {
      const mockSubscription = {
        id: 'sub_still_active',
        status: 'active',
        customer: 'cus_active',
        metadata: { clerk_user_id: 'user_active' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_active_fail',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_active_fail',
              amount_paid: 0,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_still_active' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_active_fail',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('subscription_not_in_failure_status');
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
          id: 'evt_past_due',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_past_due',
              amount_paid: 0,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 2,
              parent: {
                subscription_details: { subscription: 'sub_past_due' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_past_due',
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
            invoiceId: 'in_past_due',
          }),
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalled();
    });

    it('downgrades user for unpaid subscription status', async () => {
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
          id: 'evt_unpaid',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_unpaid',
              amount_paid: 0,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 3,
              parent: {
                subscription_details: { subscription: 'sub_unpaid' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_unpaid',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_unpaid',
          isPro: false,
        })
      );
    });

    it('sends dunning email when shouldSendDunningEmail returns true', async () => {
      const mockSubscription = {
        id: 'sub_dunning',
        status: 'past_due',
        customer: 'cus_dunning',
        metadata: { clerk_user_id: 'user_dunning' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockShouldSendDunningEmail.mockReturnValue(true);

      const context: WebhookContext = {
        event: {
          id: 'evt_dunning',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_dunning',
              amount_paid: 0,
              amount_due: 2999,
              currency: 'usd',
              attempt_count: 2,
              parent: {
                subscription_details: { subscription: 'sub_dunning' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_dunning',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockShouldSendDunningEmail).toHaveBeenCalledWith(2);
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith({
        userId: 'user_dunning',
        amountDue: 2999,
        currency: 'usd',
        attemptCount: 2,
        invoiceId: 'in_dunning',
        priceId: 'price_pro_monthly',
        customerId: 'cus_dunning',
      });
    });

    it('does not send dunning email when shouldSendDunningEmail returns false', async () => {
      const mockSubscription = {
        id: 'sub_no_dun',
        status: 'past_due',
        customer: 'cus_no_dun',
        metadata: { clerk_user_id: 'user_no_dun' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockShouldSendDunningEmail.mockReturnValue(false);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_dun',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_no_dun',
              amount_paid: 0,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 5,
              parent: {
                subscription_details: { subscription: 'sub_no_dun' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_dun',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    });

    it('skips when invoice has no subscription', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_nosub_fail',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_nosub_fail',
              amount_paid: 0,
              amount_due: 1999,
              attempt_count: 1,
              parent: null,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_nosub_fail',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('invoice_has_no_subscription');
    });

    it('skips when user cannot be identified', async () => {
      const mockSubscription = {
        id: 'sub_no_uid',
        status: 'past_due',
        customer: 'cus_no_uid',
        metadata: {},
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_uid',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_no_uid',
              amount_paid: 0,
              amount_due: 1999,
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_no_uid' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_uid',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cannot_identify_user_for_payment_failure');
    });
  });

  describe('extractSubscriptionId - SDK format handling', () => {
    it('extracts subscription ID from v20+ parent.subscription_details (string)', async () => {
      const mockSubscription = {
        id: 'sub_v20',
        status: 'active',
        customer: 'cus_v20',
        metadata: { clerk_user_id: 'user_v20' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_v20',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_v20',
              amount_paid: 1999,
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_v20' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_v20',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_v20');
    });

    it('extracts subscription ID from v20+ parent.subscription_details (expanded object)', async () => {
      const mockSubscription = {
        id: 'sub_expanded',
        status: 'active',
        customer: 'cus_expanded',
        metadata: { clerk_user_id: 'user_expanded' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_expanded',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_expanded',
              amount_paid: 1999,
              attempt_count: 1,
              parent: {
                subscription_details: {
                  subscription: { id: 'sub_expanded' },
                },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_expanded',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_expanded'
      );
    });

    it('falls back to legacy top-level subscription field (string)', async () => {
      const mockSubscription = {
        id: 'sub_legacy',
        status: 'active',
        customer: 'cus_legacy',
        metadata: { clerk_user_id: 'user_legacy' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_legacy',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_legacy',
              amount_paid: 1999,
              attempt_count: 1,
              subscription: 'sub_legacy', // Legacy field
              parent: null,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_legacy',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_legacy'
      );
    });

    it('falls back to legacy top-level subscription field (expanded object)', async () => {
      const mockSubscription = {
        id: 'sub_legacy_obj',
        status: 'active',
        customer: 'cus_legacy_obj',
        metadata: { clerk_user_id: 'user_legacy_obj' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_legacy_obj',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_legacy_obj',
              amount_paid: 1999,
              attempt_count: 1,
              subscription: { id: 'sub_legacy_obj' }, // Legacy expanded object
              parent: null,
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_legacy_obj',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_legacy_obj'
      );
    });
  });

  describe('extractUserId - fallback to customer lookup', () => {
    it('uses metadata clerk_user_id when available (payment_failed path)', async () => {
      const mockSubscription = {
        id: 'sub_meta',
        status: 'past_due',
        customer: 'cus_meta',
        metadata: { clerk_user_id: 'user_from_meta' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_meta',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_meta',
              amount_paid: 0,
              amount_due: 1999,
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_meta' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_meta',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_from_meta',
        })
      );
    });

    it('falls back to customer lookup when metadata missing (payment_failed path)', async () => {
      const mockSubscription = {
        id: 'sub_fallback',
        status: 'past_due',
        customer: 'cus_fallback',
        metadata: {},
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_from_db');

      const context: WebhookContext = {
        event: {
          id: 'evt_fallback',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_fallback',
              amount_paid: 0,
              amount_due: 1999,
              attempt_count: 1,
              parent: {
                subscription_details: { subscription: 'sub_fallback' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_fallback',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

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
        })
      );
    });
  });

  describe('error handling', () => {
    it('throws when billing status update fails on payment_failed', async () => {
      const mockSubscription = {
        id: 'sub_update_fail',
        status: 'past_due',
        customer: 'cus_update_fail',
        metadata: { clerk_user_id: 'user_update_fail' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockUpdateUserBillingStatus.mockResolvedValue({
        success: false,
        error: 'Database connection error',
      });

      const context: WebhookContext = {
        event: {
          id: 'evt_update_fail',
          type: 'invoice.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_update_fail',
              amount_paid: 0,
              amount_due: 1999,
              attempt_count: 2,
              parent: {
                subscription_details: { subscription: 'sub_update_fail' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_update_fail',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Failed to downgrade user: Database connection error'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Failed to downgrade user after payment failure',
        expect.any(Error),
        expect.objectContaining({
          userId: 'user_update_fail',
          event: 'invoice.payment_failed',
        })
      );
    });

    it('handles commission recording failure gracefully', async () => {
      const mockSubscription = {
        id: 'sub_comm_fail',
        status: 'active',
        customer: 'cus_comm_fail',
        metadata: { clerk_user_id: 'user_comm_fail' },
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetInternalUserId.mockResolvedValue('internal_fail');
      mockRecordCommission.mockRejectedValue(new Error('Commission DB error'));

      const context: WebhookContext = {
        event: {
          id: 'evt_comm_fail',
          type: 'invoice.payment_succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'in_comm_fail',
              amount_paid: 1999,
              amount_due: 1999,
              currency: 'usd',
              attempt_count: 1,
              period_start: 1700000000,
              period_end: 1702592000,
              parent: {
                subscription_details: { subscription: 'sub_comm_fail' },
              },
            } as unknown as Stripe.Invoice,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_comm_fail',
        stripeEventTimestamp: new Date(),
      };

      // Should not throw - commission errors are swallowed
      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to record referral commission',
        expect.objectContaining({
          error: 'Commission DB error',
        })
      );
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

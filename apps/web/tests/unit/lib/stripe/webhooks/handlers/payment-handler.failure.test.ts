/**
 * Payment Handler Tests - Payment Failed
 *
 * Tests for invoice.payment_failed handling.
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

import { PaymentHandler } from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('@critical PaymentHandler - payment failed', () => {
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

  it('logs payment failure and skips when subscription is not in failure status', async () => {
    const mockSubscription = {
      id: 'sub_active',
      status: 'active',
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

    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Payment failed for invoice',
      expect.any(Error),
      expect.objectContaining({
        invoiceId: 'in_fail_active',
        amountDue: 2000,
        attemptCount: 1,
      })
    );

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
            subscription: null,
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

    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Payment failed for invoice',
      expect.any(Error),
      expect.objectContaining({
        invoiceId: 'in_fail_no_sub',
      })
    );

    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it('skips processing when user cannot be identified', async () => {
    const mockSubscription = {
      id: 'sub_no_user',
      status: 'past_due',
      customer: 'cus_unknown',
      metadata: {},
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

    expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith('cus_unknown');
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
  });

  it('falls back to customer ID lookup when metadata is missing', async () => {
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
            subscription: { id: 'sub_expanded_fail' },
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
      customer: { id: 'cus_expanded' } as Stripe.Customer,
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
    expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
  });
});

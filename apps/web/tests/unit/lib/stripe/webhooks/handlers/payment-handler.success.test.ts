/**
 * Payment Handler Tests - Payment Succeeded
 *
 * Tests for invoice.payment_succeeded handling.
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

describe('@critical PaymentHandler - payment succeeded', () => {
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
            subscription: { id: 'sub_expanded' },
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
            subscription: null,
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
    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
  });

  it('skips processing when no user ID in subscription metadata', async () => {
    const mockSubscription = {
      id: 'sub_no_meta',
      status: 'active',
      customer: 'cus_789',
      metadata: {},
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

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_user_id_in_subscription_metadata');
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

/**
 * Subscription Handler Tests - Updated Events
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock calls
const {
  mockGetUserIdFromStripeCustomer,
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  mockGetPlanFromPriceId,
  mockCaptureCriticalError,
  mockLogFallback,
} = vi.hoisted(() => ({
  mockGetUserIdFromStripeCustomer: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockGetPlanFromPriceId: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
  mockLogFallback: vi.fn(),
}));

// Setup mocks
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

import { SubscriptionHandler } from '@/lib/stripe/webhooks/handlers/subscription-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

function setupDefaultMocks() {
  mockGetPlanFromPriceId.mockReturnValue('standard');
  mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
  mockInvalidateBillingCache.mockResolvedValue(undefined);
}

describe('@critical SubscriptionHandler - Updated', () => {
  let handler: SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SubscriptionHandler: SubscriptionHandlerClass } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandlerClass();
    setupDefaultMocks();
  });

  it('processes subscription updated with active status', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_updated_123',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_updated_123',
            status: 'active',
            customer: 'cus_123',
            metadata: { clerk_user_id: 'user_updated' },
            items: { data: [{ price: { id: 'price_pro_yearly' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_updated_123',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_updated',
        isPro: true,
        stripeSubscriptionId: 'sub_updated_123',
        eventType: 'subscription_updated',
      })
    );
    expect(mockInvalidateBillingCache).toHaveBeenCalled();
  });

  it('processes subscription updated with past_due status (downgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_updated_past_due',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_past_due',
            status: 'past_due',
            customer: 'cus_past_due',
            metadata: { clerk_user_id: 'user_past_due' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_updated_past_due',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_past_due',
        isPro: false,
        eventType: 'subscription_downgraded',
      })
    );
    expect(mockInvalidateBillingCache).toHaveBeenCalled();
  });

  it('processes subscription updated with trialing status (upgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_updated_trial',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_trial',
            status: 'trialing',
            customer: 'cus_trial',
            metadata: { clerk_user_id: 'user_trial' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_updated_trial',
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

  it('falls back to customer ID lookup when metadata is missing', async () => {
    mockGetUserIdFromStripeCustomer.mockResolvedValue(
      'user_from_customer_lookup'
    );

    const context: WebhookContext = {
      event: {
        id: 'evt_updated_no_meta',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_updated_no_meta',
            status: 'active',
            customer: 'cus_no_meta',
            metadata: {},
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_updated_no_meta',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockLogFallback).toHaveBeenCalledWith(
      'No user ID in subscription metadata',
      expect.objectContaining({ event: 'customer.subscription.updated' })
    );
    expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith('cus_no_meta');
  });
});

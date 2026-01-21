/**
 * Subscription Handler Tests - Deleted Events
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import {
  mockCaptureCriticalError,
  mockGetUserIdFromStripeCustomer,
  mockInvalidateBillingCache,
  mockLogFallback,
  mockUpdateUserBillingStatus,
  setupDefaultMocks,
} from './subscription-handler.test-utils';

describe('@critical SubscriptionHandler - Deleted', () => {
  let handler: import('@/lib/stripe/webhooks/handlers/subscription-handler').SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandler();
  });

  it('processes subscription deleted and revokes pro access', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_123',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_deleted_123',
            status: 'canceled',
            customer: 'cus_deleted',
            metadata: { clerk_user_id: 'user_deleted' },
            canceled_at: Math.floor(Date.now() / 1000),
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_123',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_deleted',
        isPro: false,
        stripeSubscriptionId: null,
        eventType: 'subscription_deleted',
        metadata: expect.objectContaining({
          subscriptionStatus: 'canceled',
        }),
      })
    );
    expect(mockInvalidateBillingCache).toHaveBeenCalled();
  });

  it('falls back to customer ID lookup when metadata is missing', async () => {
    mockGetUserIdFromStripeCustomer.mockResolvedValue('user_deleted_from_db');

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_no_meta',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_deleted_no_meta',
            status: 'canceled',
            customer: 'cus_deleted_no_meta',
            metadata: {},
            canceled_at: Math.floor(Date.now() / 1000),
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_no_meta',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockLogFallback).toHaveBeenCalledWith(
      'No user ID in subscription metadata',
      expect.objectContaining({ event: 'customer.subscription.deleted' })
    );
    expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith(
      'cus_deleted_no_meta'
    );
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_deleted_from_db',
        isPro: false,
        eventType: 'subscription_deleted',
      })
    );
  });

  it('throws error when billing update fails on deletion', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: false,
      error: 'Database error',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_fail',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_deleted_fail',
            status: 'canceled',
            customer: 'cus_deleted_fail',
            metadata: { clerk_user_id: 'user_deleted_fail' },
            canceled_at: Math.floor(Date.now() / 1000),
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_fail',
      stripeEventTimestamp: new Date(),
    };

    await expect(handler.handle(context)).rejects.toThrow(
      'Failed to downgrade user: Database error'
    );

    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Failed to downgrade user on subscription deletion',
      expect.any(Error),
      expect.objectContaining({
        userId: 'user_deleted_fail',
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.deleted',
      })
    );
  });

  it('propagates skipped result from billing update on deletion', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'stale_event',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_skipped',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_deleted_skipped',
            status: 'canceled',
            customer: 'cus_deleted_skipped',
            metadata: { clerk_user_id: 'user_deleted_skipped' },
            canceled_at: Math.floor(Date.now() / 1000),
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_skipped',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('stale_event');
  });
});

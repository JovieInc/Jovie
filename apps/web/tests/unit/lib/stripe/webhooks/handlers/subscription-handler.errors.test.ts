/**
 * Subscription Handler Tests - Error Scenarios & Status Handling
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import {
  mockCaptureCriticalError,
  mockGetPlanFromPriceId,
  mockGetUserIdFromStripeCustomer,
  mockUpdateUserBillingStatus,
  setupDefaultMocks,
} from './subscription-handler.test-utils';

describe('@critical SubscriptionHandler - Errors', () => {
  let handler: import('@/lib/stripe/webhooks/handlers/subscription-handler').SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandler();
  });

  describe('user identification errors', () => {
    it('throws error when user cannot be identified (no metadata, no fallback)', async () => {
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_user',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_no_user',
              status: 'active',
              customer: 'cus_unknown',
              metadata: {},
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_user',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in subscription'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Cannot identify user for subscription creation',
        expect.any(Error),
        expect.objectContaining({
          route: '/api/stripe/webhooks',
          event: 'customer.subscription.created',
        })
      );
    });

    it('throws appropriate error message for subscription updated', async () => {
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_user_updated',
          type: 'customer.subscription.updated',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_no_user_updated',
              status: 'active',
              customer: 'cus_unknown',
              metadata: {},
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_user_updated',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in subscription'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Cannot identify user for subscription update',
        expect.any(Error),
        expect.objectContaining({
          event: 'customer.subscription.updated',
        })
      );
    });

    it('throws appropriate error message for subscription deleted', async () => {
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_user_deleted',
          type: 'customer.subscription.deleted',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_no_user_deleted',
              status: 'canceled',
              customer: 'cus_unknown',
              metadata: {},
              canceled_at: Math.floor(Date.now() / 1000),
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_user_deleted',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in subscription'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Cannot identify user for subscription deletion',
        expect.any(Error),
        expect.objectContaining({
          event: 'customer.subscription.deleted',
        })
      );
    });

    it('skips fallback when customer is not a string', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_expanded_customer',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_expanded_customer',
              status: 'active',
              customer: { id: 'cus_expanded' } as Stripe.Customer,
              metadata: {},
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_expanded_customer',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in subscription'
      );

      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
    });
  });

  describe('price validation errors', () => {
    it('throws error when subscription price ID is unknown', async () => {
      mockGetPlanFromPriceId.mockReturnValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_unknown_price',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_unknown_price',
              status: 'active',
              customer: 'cus_123',
              metadata: { clerk_user_id: 'user_test' },
              items: { data: [{ price: { id: 'price_unknown' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_unknown_price',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Unknown price ID: price_unknown'
      );
    });

    it('throws error when subscription has no price ID', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_no_price',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_no_price',
              status: 'active',
              customer: 'cus_123',
              metadata: { clerk_user_id: 'user_test' },
              items: { data: [] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_price',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'No price ID in subscription'
      );
    });
  });
});

describe('@critical SubscriptionHandler - Status Handling', () => {
  let handler: import('@/lib/stripe/webhooks/handlers/subscription-handler').SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultMocks();
    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandler();
  });

  it('handles canceled subscription status (downgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_canceled',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_canceled',
            status: 'canceled',
            customer: 'cus_canceled',
            metadata: { clerk_user_id: 'user_canceled' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_canceled',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        isPro: false,
      })
    );
  });

  it('handles incomplete subscription status (downgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_incomplete',
        type: 'customer.subscription.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_incomplete',
            status: 'incomplete',
            customer: 'cus_incomplete',
            metadata: { clerk_user_id: 'user_incomplete' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_incomplete',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        isPro: false,
      })
    );
  });

  it('handles incomplete_expired subscription status (downgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_incomplete_expired',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_incomplete_expired',
            status: 'incomplete_expired',
            customer: 'cus_incomplete_expired',
            metadata: { clerk_user_id: 'user_incomplete_expired' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_incomplete_expired',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        isPro: false,
      })
    );
  });

  it('handles unpaid subscription status (downgrades)', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_unpaid',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_unpaid',
            status: 'unpaid',
            customer: 'cus_unpaid',
            metadata: { clerk_user_id: 'user_unpaid' },
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_unpaid',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
  });
});

/**
 * Subscription Handler Tests - Misc (eventTypes, cache, singleton)
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SubscriptionHandler,
  subscriptionHandler,
} from '@/lib/stripe/webhooks/handlers/subscription-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import {
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  setupDefaultMocks,
} from './subscription-handler.test-utils';

describe('@critical SubscriptionHandler - Misc', () => {
  let handler: SubscriptionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SubscriptionHandler();
    setupDefaultMocks();
  });

  describe('eventTypes', () => {
    it('handles all subscription lifecycle event types', () => {
      expect(handler.eventTypes).toContain('customer.subscription.created');
      expect(handler.eventTypes).toContain('customer.subscription.updated');
      expect(handler.eventTypes).toContain('customer.subscription.deleted');
      expect(handler.eventTypes).toHaveLength(3);
    });
  });

  describe('unhandled event type', () => {
    it('returns skipped for unhandled event types', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_unhandled',
          type: 'customer.subscription.paused' as Stripe.Event['type'],
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_paused',
              status: 'paused',
              customer: 'cus_123',
              metadata: { clerk_user_id: 'user_test' },
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_unhandled',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('unhandled_event_type');

      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
    });
  });

  describe('billing cache invalidation', () => {
    it('invalidates billing cache after successful subscription created', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_cache_created',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_cache_created',
              status: 'active',
              customer: 'cus_cache',
              metadata: { clerk_user_id: 'user_cache' },
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache_created',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });

    it('invalidates billing cache after successful subscription updated', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_cache_updated',
          type: 'customer.subscription.updated',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_cache_updated',
              status: 'active',
              customer: 'cus_cache',
              metadata: { clerk_user_id: 'user_cache' },
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache_updated',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });

    it('invalidates billing cache after successful subscription deleted', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_cache_deleted',
          type: 'customer.subscription.deleted',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_cache_deleted',
              status: 'canceled',
              customer: 'cus_cache',
              metadata: { clerk_user_id: 'user_cache' },
              canceled_at: Math.floor(Date.now() / 1000),
              items: { data: [{ price: { id: 'price_pro' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache_deleted',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton instance', () => {
    it('exports a singleton handler instance', () => {
      expect(subscriptionHandler).toBeInstanceOf(SubscriptionHandler);
      expect(subscriptionHandler.eventTypes).toContain(
        'customer.subscription.created'
      );
      expect(subscriptionHandler.eventTypes).toContain(
        'customer.subscription.updated'
      );
      expect(subscriptionHandler.eventTypes).toContain(
        'customer.subscription.deleted'
      );
    });
  });
});

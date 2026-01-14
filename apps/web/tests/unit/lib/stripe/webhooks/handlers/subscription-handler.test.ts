/**
 * Subscription Handler Tests
 *
 * Tests for the SubscriptionHandler which processes
 * customer.subscription.created, customer.subscription.updated,
 * and customer.subscription.deleted webhook events.
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
  SubscriptionHandler,
  subscriptionHandler,
} from '@/lib/stripe/webhooks/handlers/subscription-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('SubscriptionHandler', () => {
  let handler: SubscriptionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SubscriptionHandler();

    // Default mock implementations
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
  });

  describe('eventTypes', () => {
    it('handles all subscription lifecycle event types', () => {
      expect(handler.eventTypes).toContain('customer.subscription.created');
      expect(handler.eventTypes).toContain('customer.subscription.updated');
      expect(handler.eventTypes).toContain('customer.subscription.deleted');
      expect(handler.eventTypes).toHaveLength(3);
    });
  });

  describe('handle - subscription created', () => {
    it('processes subscription created with user ID in metadata', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_created_123',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_created_123',
              status: 'active',
              customer: 'cus_123',
              metadata: { clerk_user_id: 'user_abc123' },
              items: { data: [{ price: { id: 'price_pro_monthly' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_created_123',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_abc123',
          isPro: true,
          stripeSubscriptionId: 'sub_created_123',
          eventType: 'subscription_created',
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalled();

      // Should not use fallback when metadata is present
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
      expect(mockLogFallback).not.toHaveBeenCalled();
    });

    it('falls back to customer ID lookup when metadata is missing', async () => {
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_from_db');

      const context: WebhookContext = {
        event: {
          id: 'evt_created_456',
          type: 'customer.subscription.created',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'sub_created_456',
              status: 'active',
              customer: 'cus_456',
              metadata: {}, // No clerk_user_id
              items: { data: [{ price: { id: 'price_pro_monthly' } }] },
            } as unknown as Stripe.Subscription,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_created_456',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockLogFallback).toHaveBeenCalledWith(
        'No user ID in subscription metadata',
        expect.objectContaining({ event: 'customer.subscription.created' })
      );
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith('cus_456');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_from_db',
          eventType: 'subscription_created',
        })
      );
    });
  });

  describe('handle - subscription updated', () => {
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
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith(
        'cus_no_meta'
      );
    });
  });

  describe('handle - subscription deleted', () => {
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
  });

  describe('handle - error scenarios', () => {
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

    it('throws error when subscription price ID is unknown', async () => {
      mockGetPlanFromPriceId.mockReturnValue(null); // Unknown price

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
              items: { data: [] }, // No items
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
              customer: { id: 'cus_expanded' } as Stripe.Customer, // Expanded customer object
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

      // Should not attempt fallback lookup with expanded customer object
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
    });
  });

  describe('handle - subscription status handling', () => {
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

  describe('handle - unhandled event type', () => {
    it('returns skipped for unhandled event types', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_unhandled',
          type: 'customer.subscription.paused' as any, // Not a handled type
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

      // Should not process anything
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
    });
  });

  describe('handle - billing cache invalidation', () => {
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

  describe('handle - skipped result handling', () => {
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

/**
 * Checkout Handler Tests
 *
 * Tests for the CheckoutSessionHandler which processes
 * checkout.session.completed webhook events.
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
  CheckoutSessionHandler,
  checkoutSessionHandler,
} from '@/lib/stripe/webhooks/handlers/checkout-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

describe('@critical CheckoutSessionHandler', () => {
  let handler: CheckoutSessionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CheckoutSessionHandler();

    // Default mock implementations
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
  });

  describe('eventTypes', () => {
    it('handles checkout.session.completed event type', () => {
      expect(handler.eventTypes).toContain('checkout.session.completed');
      expect(handler.eventTypes).toHaveLength(1);
    });
  });

  describe('handle - successful checkout', () => {
    it('processes checkout session with user ID in metadata', async () => {
      const mockSubscription = {
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_123',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_test_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { clerk_user_id: 'user_abc123' },
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_123',
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
          eventType: 'subscription_created',
        })
      );
      expect(mockInvalidateBillingCache).toHaveBeenCalled();

      // Should not use fallback when metadata is present
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
      expect(mockLogFallback).not.toHaveBeenCalled();
    });

    it('processes checkout session with expanded subscription object', async () => {
      const mockSubscription = {
        id: 'sub_expanded',
        status: 'active',
        customer: 'cus_456',
        items: { data: [{ price: { id: 'price_pro_yearly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_456',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_test_456',
              customer: 'cus_456',
              subscription: { id: 'sub_expanded' }, // Expanded subscription object
              metadata: { clerk_user_id: 'user_def456' },
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_456',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(
        'sub_expanded'
      );
    });
  });

  describe('handle - customer ID fallback', () => {
    it('falls back to customer ID lookup when metadata is missing', async () => {
      const mockSubscription = {
        id: 'sub_no_meta',
        status: 'active',
        customer: 'cus_789',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_from_db');

      const context: WebhookContext = {
        event: {
          id: 'evt_789',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_test_789',
              customer: 'cus_789',
              subscription: 'sub_no_meta',
              metadata: {}, // No clerk_user_id
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_789',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockLogFallback).toHaveBeenCalledWith(
        'No user ID in checkout session metadata',
        expect.objectContaining({ event: 'checkout.session.completed' })
      );
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith('cus_789');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_from_db',
        })
      );
    });

    it('handles metadata with null clerk_user_id', async () => {
      const mockSubscription = {
        id: 'sub_null_meta',
        status: 'active',
        customer: 'cus_null',
        items: { data: [{ price: { id: 'price_standard' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_fallback');

      const context: WebhookContext = {
        event: {
          id: 'evt_null',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_test_null',
              customer: 'cus_null',
              subscription: 'sub_null_meta',
              metadata: { clerk_user_id: null }, // Explicitly null
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_null',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalled();
    });
  });

  describe('handle - error scenarios', () => {
    it('throws error when user cannot be identified (no metadata, no fallback)', async () => {
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_user',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_no_user',
              customer: 'cus_unknown',
              subscription: 'sub_123',
              metadata: {},
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_user',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in checkout session'
      );

      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Cannot identify user for checkout session',
        expect.any(Error),
        expect.objectContaining({
          route: '/api/stripe/webhooks',
          event: 'checkout.session.completed',
        })
      );
    });

    it('throws error when customer field is not a string and fallback is needed', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_no_cus',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_no_cus',
              customer: null, // No customer
              subscription: 'sub_123',
              metadata: {},
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_no_cus',
        stripeEventTimestamp: new Date(),
      };

      await expect(handler.handle(context)).rejects.toThrow(
        'Missing user ID in checkout session'
      );

      // Should not attempt fallback lookup without customer ID
      expect(mockGetUserIdFromStripeCustomer).not.toHaveBeenCalled();
    });

    it('throws error when subscription price ID is unknown', async () => {
      const mockSubscription = {
        id: 'sub_unknown_price',
        status: 'active',
        customer: 'cus_123',
        items: { data: [{ price: { id: 'price_unknown' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockGetPlanFromPriceId.mockReturnValue(null); // Unknown price

      const context: WebhookContext = {
        event: {
          id: 'evt_unknown_price',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_unknown_price',
              customer: 'cus_123',
              subscription: 'sub_unknown_price',
              metadata: { clerk_user_id: 'user_test' },
            } as unknown as Stripe.Checkout.Session,
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
      const mockSubscription = {
        id: 'sub_no_price',
        status: 'active',
        customer: 'cus_123',
        items: { data: [] }, // No items
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_no_price',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_no_price',
              customer: 'cus_123',
              subscription: 'sub_no_price',
              metadata: { clerk_user_id: 'user_test' },
            } as unknown as Stripe.Checkout.Session,
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

  describe('handle - one-time payment checkout', () => {
    it('skips processing for checkout sessions without subscription', async () => {
      const context: WebhookContext = {
        event: {
          id: 'evt_onetime',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_onetime',
              customer: 'cus_123',
              subscription: null, // One-time payment, no subscription
              metadata: { clerk_user_id: 'user_onetime' },
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_onetime',
        stripeEventTimestamp: new Date(),
      };

      const result = await handler.handle(context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('checkout_session_has_no_subscription');

      // Should not retrieve subscription or update billing
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
    });
  });

  describe('handle - subscription status handling', () => {
    it('handles active subscription status', async () => {
      const mockSubscription = {
        id: 'sub_active',
        status: 'active',
        customer: 'cus_123',
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_active',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_active',
              customer: 'cus_123',
              subscription: 'sub_active',
              metadata: { clerk_user_id: 'user_active' },
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_active',
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

    it('handles trialing subscription status', async () => {
      const mockSubscription = {
        id: 'sub_trial',
        status: 'trialing',
        customer: 'cus_456',
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_trial',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_trial',
              customer: 'cus_456',
              subscription: 'sub_trial',
              metadata: { clerk_user_id: 'user_trial' },
            } as unknown as Stripe.Checkout.Session,
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

    it('handles incomplete subscription status (downgrades)', async () => {
      const mockSubscription = {
        id: 'sub_incomplete',
        status: 'incomplete',
        customer: 'cus_789',
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_incomplete',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_incomplete',
              customer: 'cus_789',
              subscription: 'sub_incomplete',
              metadata: { clerk_user_id: 'user_incomplete' },
            } as unknown as Stripe.Checkout.Session,
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
  });

  describe('handle - billing cache invalidation', () => {
    it('invalidates billing cache after successful processing', async () => {
      const mockSubscription = {
        id: 'sub_cache',
        status: 'active',
        customer: 'cus_cache',
        items: { data: [{ price: { id: 'price_pro' } }] },
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const context: WebhookContext = {
        event: {
          id: 'evt_cache',
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_cache',
              customer: 'cus_cache',
              subscription: 'sub_cache',
              metadata: { clerk_user_id: 'user_cache' },
            } as unknown as Stripe.Checkout.Session,
          },
        } as Stripe.Event,
        stripeEventId: 'evt_cache',
        stripeEventTimestamp: new Date(),
      };

      await handler.handle(context);

      expect(mockInvalidateBillingCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton instance', () => {
    it('exports a singleton handler instance', () => {
      expect(checkoutSessionHandler).toBeInstanceOf(CheckoutSessionHandler);
      expect(checkoutSessionHandler.eventTypes).toContain(
        'checkout.session.completed'
      );
    });
  });
});

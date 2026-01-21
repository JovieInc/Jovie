/**
 * Subscription Handler Tests - Created Events
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

describe('@critical SubscriptionHandler - Created', () => {
  let handler: SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SubscriptionHandler: SubscriptionHandlerClass } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandlerClass();
    setupDefaultMocks();
  });

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

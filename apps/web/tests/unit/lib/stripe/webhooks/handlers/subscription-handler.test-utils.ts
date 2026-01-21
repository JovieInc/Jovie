/**
 * Shared test utilities for subscription handler tests
 */
import type Stripe from 'stripe';
import { vi } from 'vitest';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

// Hoisted mocks - must be defined before vi.mock calls
export const {
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

/**
 * Create a webhook context for testing
 */
export function createSubscriptionContext(
  eventType:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted',
  subscriptionOverrides: Partial<Stripe.Subscription> = {}
): WebhookContext {
  const baseSubscription = {
    id: `sub_${eventType.replace(/\./g, '_')}_${Date.now()}`,
    status: 'active' as const,
    customer: 'cus_123',
    metadata: { clerk_user_id: 'user_test' },
    items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    ...subscriptionOverrides,
  };

  return {
    event: {
      id: `evt_${Date.now()}`,
      type: eventType,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: baseSubscription as unknown as Stripe.Subscription,
      },
    } as Stripe.Event,
    stripeEventId: `evt_${Date.now()}`,
    stripeEventTimestamp: new Date(),
  };
}

/**
 * Setup default mock implementations
 */
export function setupDefaultMocks() {
  mockGetPlanFromPriceId.mockReturnValue('standard');
  mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
  mockInvalidateBillingCache.mockResolvedValue(undefined);
}

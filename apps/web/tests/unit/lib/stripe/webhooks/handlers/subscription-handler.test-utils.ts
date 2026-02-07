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

// Mock heavy dependencies to prevent slow module resolution timeouts
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { userId: 'userId' },
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackUpgrade: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

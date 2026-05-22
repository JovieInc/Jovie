/**
 * Stripe Client - cancelSubscription regression test (JOV-2180)
 *
 * Locks in the cancel-at-period-end semantics so a future refactor cannot
 * silently re-introduce immediate cancellation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubscriptionsUpdate = vi.hoisted(() => vi.fn());
const mockSubscriptionsCancel = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_PROFILE_URL: 'https://test.jovie.ai',
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
  },
}));

vi.mock('server-only', () => ({}));

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      subscriptions = {
        update: mockSubscriptionsUpdate,
        cancel: mockSubscriptionsCancel,
        list: vi.fn(),
        retrieve: vi.fn(),
      };
      customers = {
        search: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      };
    },
  };
});

import { cancelSubscription } from '@/lib/stripe/client';

describe('cancelSubscription (JOV-2180)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls subscriptions.update with cancel_at_period_end: true (NOT subscriptions.cancel)', async () => {
    const periodEndSeconds = 1781481600;
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      id: 'sub_abc',
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: periodEndSeconds,
      current_period_end: periodEndSeconds,
    });

    const result = await cancelSubscription('sub_abc');

    expect(mockSubscriptionsUpdate).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_abc', {
      cancel_at_period_end: true,
    });

    // The immediate-cancel API must NOT be called.
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();

    // Returned subscription propagates the cancel-at-period-end flag.
    expect(result.cancel_at_period_end).toBe(true);
    expect(result.status).toBe('active');
  });

  it('captures the underlying error and throws a generic message', async () => {
    const stripeError = new Error('Stripe is on fire');
    mockSubscriptionsUpdate.mockRejectedValueOnce(stripeError);

    await expect(cancelSubscription('sub_err')).rejects.toThrow(
      'Failed to cancel subscription'
    );

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Error scheduling subscription cancellation',
      stripeError,
      { subscriptionId: 'sub_err' }
    );
  });
});

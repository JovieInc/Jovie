import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCancelSubscription = vi.hoisted(() => vi.fn());
const mockGetUserBillingInfo = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/stripe/client', () => ({
  cancelSubscription: mockCancelSubscription,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    info: mockLoggerInfo,
  },
}));

describe('POST /api/stripe/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('captures critical error with user and subscription context when cancellation fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        stripeSubscriptionId: 'sub_123',
        isPro: true,
      },
    });
    const cancellationError = new Error('Stripe cancellation failed');
    mockCancelSubscription.mockRejectedValue(cancellationError);

    const { POST } = await import('@/app/api/stripe/cancel/route');

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to cancel subscription' });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Stripe subscription cancellation failed',
      cancellationError,
      {
        route: '/api/stripe/cancel',
        userId: 'user_123',
        subscriptionId: 'sub_123',
      }
    );
  });
});

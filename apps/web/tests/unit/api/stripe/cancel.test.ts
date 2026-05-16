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

// Cold-import + module reset between cases is slow on this route;
// give the suite enough headroom on a chilly machine.
describe('POST /api/stripe/cancel', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('schedules cancellation at period end and returns the cancel-on date (JOV-2180)', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValueOnce({
      success: true,
      data: {
        stripeSubscriptionId: 'sub_123',
        isPro: true,
      },
    });
    // 2026-06-15T00:00:00Z in seconds
    const periodEndSeconds = 1781481600;
    mockCancelSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: periodEndSeconds,
      current_period_end: periodEndSeconds,
    });

    const { POST } = await import('@/app/api/stripe/cancel/route');

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_123');
    expect(data).toEqual({
      success: true,
      status: 'active',
      cancelAtPeriodEnd: true,
      cancelAt: new Date(periodEndSeconds * 1000).toISOString(),
    });
  });

  it('falls back to current_period_end when cancel_at is missing', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValueOnce({
      success: true,
      data: {
        stripeSubscriptionId: 'sub_123',
        isPro: true,
      },
    });
    const periodEndSeconds = 1781481600;
    mockCancelSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: true,
      // cancel_at intentionally null — Stripe sometimes omits it on the
      // initial update; current_period_end is the source of truth.
      cancel_at: null,
      current_period_end: periodEndSeconds,
    });

    const { POST } = await import('@/app/api/stripe/cancel/route');

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelAt).toBe(new Date(periodEndSeconds * 1000).toISOString());
  });

  it('returns null cancelAt when neither cancel_at nor current_period_end is set', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValueOnce({
      success: true,
      data: {
        stripeSubscriptionId: 'sub_123',
        isPro: true,
      },
    });
    mockCancelSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: null,
    });

    const { POST } = await import('@/app/api/stripe/cancel/route');

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelAt).toBeNull();
    expect(data.cancelAtPeriodEnd).toBe(true);
  });

  it('captures critical error with user and subscription context when cancellation fails', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValueOnce({
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

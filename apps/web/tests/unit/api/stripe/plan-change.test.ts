import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockGetActiveSubscription = vi.hoisted(() => vi.fn());
const mockGetAvailablePlanChanges = vi.hoisted(() => vi.fn());
const mockExecutePlanChange = vi.hoisted(() => vi.fn());
const mockCancelScheduledPlanChange = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

vi.mock('@/lib/stripe/customer-sync', () => ({
  ensureStripeCustomer: mockEnsureStripeCustomer,
}));

vi.mock('@/lib/stripe/plan-change', () => ({
  getActiveSubscription: mockGetActiveSubscription,
  getAvailablePlanChanges: mockGetAvailablePlanChanges,
  executePlanChange: mockExecutePlanChange,
  cancelScheduledPlanChange: mockCancelScheduledPlanChange,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('/api/stripe/plan-change route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('POST', () => {
    it('returns 401 for unauthenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/stripe/plan-change/route');
      const request = new NextRequest(
        'http://localhost/api/stripe/plan-change',
        {
          method: 'POST',
          body: JSON.stringify({ priceId: 'price_pro_monthly' }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when priceId is invalid', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const { POST } = await import('@/app/api/stripe/plan-change/route');
      const request = new NextRequest(
        'http://localhost/api/stripe/plan-change',
        {
          method: 'POST',
          body: JSON.stringify({ priceId: 123 }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid price ID' });
    });

    it('changes plan immediately when executePlanChange succeeds', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnsureStripeCustomer.mockResolvedValue({
        success: true,
        customerId: 'cus_123',
      });
      mockGetActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        schedule: null,
      });

      const effectiveDate = new Date('2026-02-01T00:00:00.000Z');
      mockExecutePlanChange.mockResolvedValue({
        success: true,
        isScheduledChange: false,
        effectiveDate,
      });

      const { POST } = await import('@/app/api/stripe/plan-change/route');
      const request = new NextRequest(
        'http://localhost/api/stripe/plan-change',
        {
          method: 'POST',
          body: JSON.stringify({ priceId: 'price_growth_monthly' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        isScheduledChange: false,
        effectiveDate: '2026-02-01T00:00:00.000Z',
        message: 'Your plan has been updated',
      });
      expect(mockExecutePlanChange).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
        newPriceId: 'price_growth_monthly',
      });
    });
  });

  describe('GET', () => {
    it('returns free plan when user has no stripe customer yet', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnsureStripeCustomer.mockResolvedValue({ success: false });
      mockGetAvailablePlanChanges.mockResolvedValue({
        availableChanges: [{ plan: 'pro' }],
      });

      const { GET } = await import('@/app/api/stripe/plan-change/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        currentPlan: 'free',
        currentPriceId: null,
        currentInterval: null,
        availableChanges: [{ plan: 'pro' }],
        hasActiveSubscription: false,
      });
    });

    it('returns plan options with scheduled change metadata', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnsureStripeCustomer.mockResolvedValue({
        success: true,
        customerId: 'cus_123',
      });
      mockGetAvailablePlanChanges.mockResolvedValue({
        currentPlan: 'pro',
        currentPriceId: 'price_pro_monthly',
        currentInterval: 'month',
        availableChanges: [{ plan: 'growth' }],
      });
      mockGetActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        schedule: { id: 'sub_sched_123' },
      });

      const { GET } = await import('@/app/api/stripe/plan-change/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        currentPlan: 'pro',
        currentPriceId: 'price_pro_monthly',
        currentInterval: 'month',
        availableChanges: [{ plan: 'growth' }],
        hasActiveSubscription: true,
        hasScheduledChange: true,
      });
    });
  });

  describe('DELETE', () => {
    it('returns 400 when there is no active subscription', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnsureStripeCustomer.mockResolvedValue({
        success: true,
        customerId: 'cus_123',
      });
      mockGetActiveSubscription.mockResolvedValue(null);

      const { DELETE } = await import('@/app/api/stripe/plan-change/route');
      const response = await DELETE();

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'No active subscription',
      });
    });

    it('cancels scheduled changes successfully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnsureStripeCustomer.mockResolvedValue({
        success: true,
        customerId: 'cus_123',
      });
      mockGetActiveSubscription.mockResolvedValue({ id: 'sub_123' });
      mockCancelScheduledPlanChange.mockResolvedValue({ success: true });

      const { DELETE } = await import('@/app/api/stripe/plan-change/route');
      const response = await DELETE();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        message: 'Scheduled plan change cancelled',
      });
      expect(mockCancelScheduledPlanChange).toHaveBeenCalledWith('sub_123');
    });
  });
});

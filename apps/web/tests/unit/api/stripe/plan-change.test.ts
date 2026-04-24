import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { malformedJsonRequest } from '@/tests/helpers/malformed-json-request';

const mockAuth = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockGetActiveSubscription = vi.hoisted(() => vi.fn());
const mockGetAvailablePlanChanges = vi.hoisted(() => vi.fn());
const mockExecutePlanChange = vi.hoisted(() => vi.fn());
const mockCancelScheduledPlanChange = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());
const mockIsMaxPriceId = vi.hoisted(() => vi.fn());

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
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/stripe/config', () => ({
  isMaxPlanEnabled: mockIsMaxPlanEnabled,
  isMaxPriceId: mockIsMaxPriceId,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const routeModulePromise = import('@/app/api/stripe/plan-change/route');

describe('/api/stripe/plan-change route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMaxPlanEnabled.mockReturnValue(true);
    mockIsMaxPriceId.mockReturnValue(false);
  });

  describe('POST', () => {
    it('returns 401 for unauthenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await routeModulePromise;
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

      const { POST } = await routeModulePromise;
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

    it('returns 400 (not 500) when the request body is not valid JSON', async () => {
      // Regression: malformed JSON was being caught by the generic error
      // handler and returned as a 500 with `captureCriticalError` (fatal).
      // Malformed JSON is a client error and must not page.
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const { POST } = await routeModulePromise;
      const response = await POST(
        malformedJsonRequest('/api/stripe/plan-change')
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'Invalid JSON in request body',
      });
      expect(mockExecutePlanChange).not.toHaveBeenCalled();
      expect(mockCaptureCriticalError).not.toHaveBeenCalled();
    });

    it('returns 403 when max plan is disabled', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockIsMaxPlanEnabled.mockReturnValue(false);
      mockIsMaxPriceId.mockReturnValue(true);

      const { POST } = await routeModulePromise;
      const request = new NextRequest(
        'http://localhost/api/stripe/plan-change',
        {
          method: 'POST',
          body: JSON.stringify({ priceId: 'price_max_monthly' }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Max plan is not currently available',
      });
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

      const { POST } = await routeModulePromise;
      const request = new NextRequest(
        'http://localhost/api/stripe/plan-change',
        {
          method: 'POST',
          body: JSON.stringify({ priceId: 'price_max_monthly' }),
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
        newPriceId: 'price_max_monthly',
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

      const { GET } = await routeModulePromise;
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

    it('hides growth plan from available changes when growth is disabled', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockIsMaxPlanEnabled.mockReturnValue(false);
      mockEnsureStripeCustomer.mockResolvedValue({
        success: true,
        customerId: 'cus_123',
      });
      mockGetAvailablePlanChanges.mockResolvedValue({
        currentPlan: 'pro',
        currentPriceId: 'price_pro_monthly',
        currentInterval: 'month',
        availableChanges: [{ plan: 'max' }, { plan: 'free' }],
      });
      mockGetActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        schedule: null,
      });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.availableChanges).toEqual([{ plan: 'free' }]);
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
        availableChanges: [{ plan: 'max' }],
      });
      mockGetActiveSubscription.mockResolvedValue({
        id: 'sub_123',
        schedule: { id: 'sub_sched_123' },
      });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        currentPlan: 'pro',
        currentPriceId: 'price_pro_monthly',
        currentInterval: 'month',
        availableChanges: [{ plan: 'max' }],
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

      const { DELETE } = await routeModulePromise;
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

      const { DELETE } = await routeModulePromise;
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

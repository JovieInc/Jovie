import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockPreviewPlanChange = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

vi.mock('@/lib/stripe/customer-sync', () => ({
  ensureStripeCustomer: mockEnsureStripeCustomer,
}));

vi.mock('@/lib/stripe/plan-change', () => ({
  previewPlanChange: mockPreviewPlanChange,
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

describe('/api/stripe/plan-change/preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 405 for GET requests', async () => {
    const { GET } = await import('@/app/api/stripe/plan-change/preview/route');
    const response = await GET();

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      error: 'Method not allowed. Use POST with { priceId: string }',
    });
  });

  it('returns 400 when no stripe customer exists', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockEnsureStripeCustomer.mockResolvedValue({ success: false });

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const request = new NextRequest(
      'http://localhost/api/stripe/plan-change/preview',
      {
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_growth_monthly' }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'No subscription found. Use checkout to subscribe.',
    });
  });

  it('returns preview payload with formatted amount', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockEnsureStripeCustomer.mockResolvedValue({
      success: true,
      customerId: 'cus_123',
    });

    mockPreviewPlanChange.mockResolvedValue({
      isUpgrade: true,
      immediateAmount: 599,
      currency: 'usd',
      effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
      currentPlan: 'pro',
      newPlan: 'growth',
    });

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const request = new NextRequest(
      'http://localhost/api/stripe/plan-change/preview',
      {
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_growth_monthly' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      isUpgrade: true,
      immediateAmount: 599,
      currency: 'usd',
      effectiveDate: '2026-03-01T00:00:00.000Z',
      currentPlan: 'pro',
      newPlan: 'growth',
      formattedAmount: '$5.99',
    });
    expect(mockPreviewPlanChange).toHaveBeenCalledWith({
      customerId: 'cus_123',
      newPriceId: 'price_growth_monthly',
    });
  });
});

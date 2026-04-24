import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { malformedJsonRequest } from '@/tests/helpers/malformed-json-request';

const mockAuth = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockPreviewPlanChange = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());
const mockIsMaxPriceId = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

vi.mock('@/lib/stripe/customer-sync', () => ({
  ensureStripeCustomer: mockEnsureStripeCustomer,
}));

vi.mock('@/lib/stripe/plan-change', () => ({
  previewPlanChange: mockPreviewPlanChange,
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

describe('/api/stripe/plan-change/preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsMaxPlanEnabled.mockReturnValue(true);
    mockIsMaxPriceId.mockReturnValue(false);
  });

  it('returns 405 for GET requests', async () => {
    const { GET } = await import('@/app/api/stripe/plan-change/preview/route');
    const response = await GET();

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      error: 'Method not allowed. Use POST with { priceId: string }',
    });
  });

  it('returns 403 when max plan is disabled', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockIsMaxPlanEnabled.mockReturnValue(false);
    mockIsMaxPriceId.mockReturnValue(true);

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const request = new NextRequest(
      'http://localhost/api/stripe/plan-change/preview',
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

  it('returns 400 when no stripe customer exists', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockEnsureStripeCustomer.mockResolvedValue({ success: false });

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const request = new NextRequest(
      'http://localhost/api/stripe/plan-change/preview',
      {
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_max_monthly' }),
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
      newPlan: 'max',
    });

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const request = new NextRequest(
      'http://localhost/api/stripe/plan-change/preview',
      {
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_max_monthly' }),
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
      newPlan: 'max',
      formattedAmount: '$5.99',
    });
    expect(mockPreviewPlanChange).toHaveBeenCalledWith({
      customerId: 'cus_123',
      newPriceId: 'price_max_monthly',
    });
  });

  it('returns 400 (not 500) when the request body is not valid JSON', async () => {
    // Regression: malformed JSON was being caught by the generic error
    // handler and returned as a 500 with `captureCriticalError` (fatal).
    // Malformed JSON is a client error and must not page.
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/stripe/plan-change/preview/route');
    const response = await POST(
      malformedJsonRequest('/api/stripe/plan-change/preview')
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Invalid JSON in request body',
    });
    expect(mockPreviewPlanChange).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
  });
});

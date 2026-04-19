import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockGetActivePriceIds = vi.hoisted(() => vi.fn());
const mockGetPriceMappingDetails = vi.hoisted(() => vi.fn());
const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());
const mockIsMaxPriceId = vi.hoisted(() => vi.fn());
const mockGetOperationalControls = vi.hoisted(() => vi.fn());
const mockStripeSubscriptionsList = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/stripe/client', () => ({
  createCheckoutSession: mockCreateCheckoutSession,
  createBillingPortalSession: mockCreateBillingPortalSession,
  stripe: {
    subscriptions: {
      list: mockStripeSubscriptionsList,
    },
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  ensureStripeCustomer: mockEnsureStripeCustomer,
}));

vi.mock('@/lib/admin/operational-controls', () => ({
  getOperationalControls: mockGetOperationalControls,
}));

vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: mockGetActivePriceIds,
  getPriceMappingDetails: mockGetPriceMappingDetails,
  isMaxPlanEnabled: mockIsMaxPlanEnabled,
  isMaxPriceId: mockIsMaxPriceId,
  PRICE_MAPPINGS: {
    price_123: {
      priceId: 'price_123',
      plan: 'standard',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      description: 'Standard Monthly',
    },
  },
}));

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsMaxPlanEnabled.mockReturnValue(true);
    mockIsMaxPriceId.mockReturnValue(false);
    mockGetOperationalControls.mockResolvedValue({
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt: null,
      updatedByUserId: null,
    });
    mockGetActivePriceIds.mockReturnValue(['price_123']);
    mockGetPriceMappingDetails.mockReturnValue({
      priceId: 'price_123',
      plan: 'standard',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      description: 'Standard Monthly',
    });
    mockEnsureStripeCustomer.mockResolvedValue({
      success: true,
      customerId: 'cus_123',
    });
    mockStripeSubscriptionsList.mockResolvedValue({ data: [] });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when max plan is disabled', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetActivePriceIds.mockReturnValue(['price_max']);
    mockIsMaxPlanEnabled.mockReturnValue(false);
    mockIsMaxPriceId.mockReturnValue(true);

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_max' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Max plan is not currently available',
    });
  });

  it('returns 503 when checkout is operationally disabled', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetOperationalControls.mockResolvedValueOnce({
      signupEnabled: true,
      checkoutEnabled: false,
      stripeWebhooksEnabled: true,
      cronFanoutEnabled: true,
      updatedAt: null,
      updatedByUserId: null,
    });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates checkout session for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/pay/cs_123',
    });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('retries transient Stripe errors and preserves idempotency key', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const transientError = Object.assign(
      new Error('Temporary connection issue'),
      {
        name: 'StripeConnectionError',
        type: 'StripeConnectionError',
        statusCode: 503,
      }
    );

    mockCreateCheckoutSession
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({
        id: 'cs_retry_success',
        url: 'https://checkout.stripe.com/pay/cs_retry_success',
      });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sessionId).toBe('cs_retry_success');
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(2);

    const firstCall = mockCreateCheckoutSession.mock.calls[0][0] as {
      idempotencyKey: string;
    };
    const secondCall = mockCreateCheckoutSession.mock.calls[1][0] as {
      idempotencyKey: string;
    };

    expect(firstCall.idempotencyKey).toBe(secondCall.idempotencyKey);
  });

  it('returns 503 with Retry-After when transient Stripe errors exhaust retries', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const transientError = Object.assign(new Error('Stripe API unavailable'), {
      name: 'StripeAPIError',
      type: 'StripeAPIError',
      statusCode: 503,
    });

    mockCreateCheckoutSession.mockRejectedValue(transientError);

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(payload.error).toContain('temporarily unavailable');
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent Stripe errors', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const permanentError = Object.assign(new Error('Invalid price ID'), {
      name: 'StripeInvalidRequestError',
      type: 'StripeInvalidRequestError',
      statusCode: 400,
    });

    mockCreateCheckoutSession.mockRejectedValue(permanentError);

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { malformedJsonRequest } from '@/tests/helpers/malformed-json-request';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockGetActivePriceIds = vi.hoisted(() => vi.fn());
const mockGetPriceMappingDetails = vi.hoisted(() => vi.fn());
const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());
const mockIsMaxPriceId = vi.hoisted(() => vi.fn());
const mockStripeSubscriptionsList = vi.hoisted(() => vi.fn());
const mockWithStripeRetry = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
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

vi.mock('@/lib/stripe/retry', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/stripe/retry')>();
  return {
    ...actual,
    withStripeRetry: mockWithStripeRetry,
  };
});

import { POST } from '@/app/api/stripe/checkout/route';

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMaxPlanEnabled.mockReturnValue(true);
    mockIsMaxPriceId.mockReturnValue(false);
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
    mockWithStripeRetry.mockImplementation(async (_operation, fn) => {
      let attempts = 0;

      while (true) {
        try {
          return await fn();
        } catch (error) {
          attempts += 1;
          const statusCode =
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
              ? error.statusCode
              : undefined;
          const errorType =
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            typeof error.type === 'string'
              ? error.type
              : undefined;
          const errorName = error instanceof Error ? error.name : undefined;
          const transient =
            errorType === 'StripeConnectionError' ||
            errorType === 'StripeAPIError' ||
            errorType === 'StripeRateLimitError' ||
            errorType === 'StripeIdempotencyError' ||
            errorName === 'StripeConnectionError' ||
            errorName === 'StripeAPIError' ||
            errorName === 'StripeRateLimitError' ||
            errorName === 'StripeIdempotencyError' ||
            statusCode === 408 ||
            statusCode === 409 ||
            statusCode === 429 ||
            statusCode === 500 ||
            statusCode === 502 ||
            statusCode === 503 ||
            statusCode === 504;

          if (!transient) {
            throw error;
          }

          if (attempts >= 3) {
            const { StripeRetryExhaustedError } = await import(
              '@/lib/stripe/retry'
            );
            throw new StripeRetryExhaustedError(
              'createCheckoutSession',
              attempts,
              error
            );
          }
        }
      }
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

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
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetActivePriceIds.mockReturnValue(['price_max']);
    mockIsMaxPlanEnabled.mockReturnValue(false);
    mockIsMaxPriceId.mockReturnValue(true);

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

  it('creates checkout session for authenticated user', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/pay/cs_123',
    });

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
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });

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
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });

    const transientError = Object.assign(new Error('Stripe API unavailable'), {
      name: 'StripeAPIError',
      type: 'StripeAPIError',
      statusCode: 503,
    });

    mockCreateCheckoutSession.mockRejectedValue(transientError);

    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(payload.error).toContain('temporarily unavailable');
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent Stripe errors', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });

    const permanentError = Object.assign(new Error('Invalid price ID'), {
      name: 'StripeInvalidRequestError',
      type: 'StripeInvalidRequestError',
      statusCode: 400,
    });

    mockCreateCheckoutSession.mockRejectedValue(permanentError);

    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('returns 400 (not 500) when the request body is not valid JSON', async () => {
    // Regression: malformed JSON was being caught by the generic error handler
    // and returned as a 500 with `captureCriticalError` (fatal severity).
    // Malformed JSON is a client error, not a server error, and must not page.
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });

    const response = await POST(malformedJsonRequest('/api/stripe/checkout'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON in request body');
    // Must not reach Stripe when the body is malformed.
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    // Regression target: a malformed body must NOT page Sentry as a fatal
    // server error — parseJsonBody catches the parse failure and returns a
    // 400 directly, so captureCriticalError is never invoked.
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
  });
});

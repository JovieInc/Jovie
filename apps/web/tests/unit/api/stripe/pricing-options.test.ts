import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAvailablePricing = vi.hoisted(() => vi.fn());

const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getAvailablePricing: mockGetAvailablePricing,
  isMaxPlanEnabled: mockIsMaxPlanEnabled,
}));

const mockAssertPrice = vi.hoisted(() => vi.fn());
const mockAddBreadcrumb = vi.hoisted(() => vi.fn());
const mockCaptureMessage = vi.hoisted(() => vi.fn());
const mockRetrieve = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/stripe/price-contract', () => ({
  assertCheckoutPriceContract: mockAssertPrice,
}));
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  captureMessage: mockCaptureMessage,
  getClient: vi.fn(() => undefined),
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { prices: { retrieve: mockRetrieve } },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mockLoggerError },
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertPrice.mockReset().mockResolvedValue(undefined);
    mockRetrieve.mockReset();
    mockCaptureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    mockIsMaxPlanEnabled.mockReturnValue(true);
  });

  it('filters max pricing when max plan is disabled', async () => {
    mockIsMaxPlanEnabled.mockReturnValue(false);
    mockGetAvailablePricing.mockReturnValue([
      {
        priceId: 'price_pro_monthly',
        amount: 2000,
        currency: 'usd',
        interval: 'month',
        description: 'Pro Monthly',
        plan: 'pro',
      },
      {
        priceId: 'price_max_monthly',
        amount: 20000,
        currency: 'usd',
        interval: 'month',
        description: 'Max Monthly',
        plan: 'max',
      },
    ]);

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.options).toHaveLength(1);
    expect(data.options[0].priceId).toBe('price_pro_monthly');
  });

  it('returns pricing options', async () => {
    mockGetAvailablePricing.mockReturnValue([
      {
        priceId: 'price_monthly',
        amount: 500,
        currency: 'usd',
        interval: 'month',
        description: 'Standard Monthly',
        plan: 'standard',
      },
      {
        priceId: 'price_yearly',
        amount: 5000,
        currency: 'usd',
        interval: 'year',
        description: 'Standard Yearly',
        plan: 'standard',
      },
    ]);

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.options).toBeDefined();
    expect(Array.isArray(data.options)).toBe(true);
  });
  it('does not publish an option whose actual Stripe price fails validation', async () => {
    mockGetAvailablePricing.mockReturnValue([
      { priceId: 'price_old', plan: 'pro' },
    ]);
    const error = new Error('Billing price does not match');
    mockAssertPrice.mockRejectedValue(error);
    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to get pricing options',
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Error getting pricing options:',
      error
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Failed to get pricing options',
      error,
      { route: '/api/stripe/pricing-options', method: 'GET' }
    );
  });

  it('skips a nonexistent Stripe price and records structured observability', async () => {
    mockGetAvailablePricing.mockReturnValue([
      { priceId: 'price_missing', plan: 'pro' },
      { priceId: 'price_live', plan: 'pro', amount: 1200 },
    ]);
    mockAssertPrice
      .mockRejectedValueOnce({
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
        message: 'No such price: price_missing',
      })
      .mockResolvedValueOnce(undefined);

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.options).toEqual([{ priceId: 'price_live', amount: 1200 }]);
    const context = {
      event: 'stripe_pricing_option_skipped',
      priceId: 'price_missing',
      reason: 'price_not_found',
      route: '/api/stripe/pricing-options',
    };
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Skipping unavailable Stripe pricing option',
      context
    );
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'stripe.pricing-options',
      message: 'Skipped unavailable Stripe pricing option',
      level: 'warning',
      data: context,
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Skipping unavailable Stripe pricing option',
      {
        level: 'error',
        tags: {
          event: 'stripe_pricing_option_skipped',
          priceId: 'price_missing',
          route: '/api/stripe/pricing-options',
        },
        fingerprint: ['stripe_pricing_option_skipped', 'price_missing'],
      }
    );
  });
  it('keeps the Stripe route on the Node.js runtime', async () => {
    const route = await import('@/app/api/stripe/pricing-options/route');
    expect(route.runtime).toBe('nodejs');
  });

  it('passes the requested price through the Stripe retrieval callback', async () => {
    const price = { id: 'price_live', active: true };
    mockGetAvailablePricing.mockReturnValue([
      { priceId: 'price_live', plan: 'pro', amount: 1200 },
    ]);
    mockRetrieve.mockResolvedValue(price);
    mockAssertPrice.mockImplementation(
      async (priceId: string, retrieve: (id: string) => Promise<unknown>) => {
        expect(await retrieve(priceId)).toBe(price);
      }
    );

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockAssertPrice).toHaveBeenCalledWith(
      'price_live',
      expect.any(Function)
    );
    expect(mockRetrieve).toHaveBeenCalledExactlyOnceWith('price_live');
    expect((await response.json()).options).toEqual([
      { priceId: 'price_live', amount: 1200 },
    ]);
  });

  it.each([
    ['the missing-resource code alone', { code: 'resource_missing' }],
    [
      'a Stripe invalid-request type and missing-price message without a code',
      {
        type: 'StripeInvalidRequestError',
        message: 'No such price: price_missing',
      },
    ],
    [
      'a case-insensitive missing-resource message without a code',
      {
        type: 'StripeInvalidRequestError',
        message: 'RESOURCE_MISSING',
      },
    ],
  ])('skips a price identified by %s', async (_label, error) => {
    mockGetAvailablePricing.mockReturnValue([
      { priceId: 'price_missing', plan: 'pro' },
      { priceId: 'price_live', plan: 'pro', amount: 1200 },
    ]);
    mockAssertPrice
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.options).toEqual([{ priceId: 'price_live', amount: 1200 }]);
    expect(data.pricingOptions).toEqual(data.options);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an unrelated Stripe error type with a matching message',
      { type: 'StripeAPIError', message: 'No such price: price_missing' },
    ],
    [
      'a matching message without a Stripe error type',
      { message: 'No such price' },
    ],
    [
      'an invalid-request error with an unrelated message',
      { type: 'StripeInvalidRequestError', message: 'Invalid currency' },
    ],
    [
      'a non-string message that could otherwise be coerced into a match',
      {
        type: 'StripeInvalidRequestError',
        message: { toString: () => 'No such price: price_missing' },
      },
    ],
    ['a null rejection', null],
    ['an undefined rejection', undefined],
    ['a primitive rejection', 'resource_missing'],
    [
      'a callable rejection carrying a missing-resource code',
      Object.assign(() => undefined, { code: 'resource_missing' }),
    ],
  ])(
    'fails closed for %s and preserves the original error',
    async (_label, error) => {
      mockGetAvailablePricing.mockReturnValue([
        { priceId: 'price_invalid', plan: 'pro' },
      ]);
      mockAssertPrice.mockRejectedValue(error);

      const { GET } = await import('@/app/api/stripe/pricing-options/route');
      const response = await GET();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to get pricing options',
      });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to get pricing options',
        error,
        { route: '/api/stripe/pricing-options', method: 'GET' }
      );
      expect(mockCaptureError.mock.calls[0]?.[1]).toBe(error);
      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    }
  );
});

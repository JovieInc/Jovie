import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAvailablePricing = vi.hoisted(() => vi.fn());

const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getAvailablePricing: mockGetAvailablePricing,
  isMaxPlanEnabled: mockIsMaxPlanEnabled,
}));

const mockAssertPrice = vi.hoisted(() => vi.fn());
const mockRetrieve = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/stripe/price-contract', () => ({
  assertCheckoutPriceContract: mockAssertPrice,
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
    expect(mockAssertPrice).toHaveBeenCalledExactlyOnceWith(
      'price_pro_monthly',
      expect.any(Function)
    );
  });

  it('returns the complete catalog in both response fields', async () => {
    const options = [
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
    ];
    mockGetAvailablePricing.mockReturnValue(options);

    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ pricingOptions: options, options });
    expect(mockAssertPrice).toHaveBeenCalledTimes(options.length);
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

  it.each([0, 1, 99])(
    'fails the entire request for a missing Stripe price alongside %i valid prices',
    async validPriceCount => {
      const error = Object.assign(new Error('No such price: price_missing'), {
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
      });
      const validOptions = Array.from(
        { length: validPriceCount },
        (_, index) => ({
          priceId: `price_live_${index}`,
          plan: 'pro',
          amount: 1200,
        })
      );
      mockGetAvailablePricing.mockReturnValue([
        ...validOptions,
        { priceId: 'price_missing', plan: 'pro' },
      ]);
      mockAssertPrice.mockImplementation(
        async (priceId: string, retrieve: (id: string) => Promise<unknown>) => {
          await retrieve(priceId);
        }
      );
      mockRetrieve.mockImplementation(async (priceId: string) => {
        if (priceId === 'price_missing') throw error;
        return { id: priceId };
      });

      const { GET } = await import('@/app/api/stripe/pricing-options/route');
      const response = await GET();

      expect(mockRetrieve).toHaveBeenCalledTimes(validPriceCount + 1);
      expect(mockRetrieve).toHaveBeenCalledWith('price_missing');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to get pricing options',
      });
      expect(mockCaptureError).toHaveBeenCalledExactlyOnceWith(
        'Failed to get pricing options',
        error,
        { route: '/api/stripe/pricing-options', method: 'GET' }
      );
    }
  );

  it('keeps the Stripe route on its required server runtime', async () => {
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
      { priceId: 'price_live', amount: 1200, plan: 'pro' },
    ]);
  });
});

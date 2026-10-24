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
vi.mock('@/lib/stripe/price-contract', () => ({
  assertCheckoutPriceContract: mockAssertPrice,
}));
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  captureMessage: mockCaptureMessage,
  getClient: vi.fn(() => undefined),
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { prices: { retrieve: vi.fn() } },
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertPrice.mockResolvedValue(undefined);
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
    mockAssertPrice.mockRejectedValue(
      new Error('Billing price does not match')
    );
    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('options');
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
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'stripe.pricing-options',
        data: expect.objectContaining({
          event: 'stripe_pricing_option_skipped',
          priceId: 'price_missing',
          reason: 'price_not_found',
        }),
      })
    );
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
});

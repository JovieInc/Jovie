import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAvailablePricing = vi.hoisted(() => vi.fn());

const mockIsMaxPlanEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getAvailablePricing: mockGetAvailablePricing,
  isMaxPlanEnabled: mockIsMaxPlanEnabled,
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

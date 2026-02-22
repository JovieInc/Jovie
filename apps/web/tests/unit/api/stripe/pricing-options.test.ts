import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAvailablePricing = vi.hoisted(() => vi.fn());

const mockIsGrowthPlanEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getAvailablePricing: mockGetAvailablePricing,
  isGrowthPlanEnabled: mockIsGrowthPlanEnabled,
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsGrowthPlanEnabled.mockReturnValue(true);
  });

  it('filters growth pricing when growth plan is disabled', async () => {
    mockIsGrowthPlanEnabled.mockReturnValue(false);
    mockGetAvailablePricing.mockReturnValue([
      {
        priceId: 'price_pro_monthly',
        amount: 3900,
        currency: 'usd',
        interval: 'month',
        description: 'Pro Monthly',
        plan: 'pro',
      },
      {
        priceId: 'price_growth_monthly',
        amount: 9900,
        currency: 'usd',
        interval: 'month',
        description: 'Growth Monthly',
        plan: 'growth',
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

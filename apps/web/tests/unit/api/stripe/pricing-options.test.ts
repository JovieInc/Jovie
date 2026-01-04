import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAvailablePricing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getAvailablePricing: mockGetAvailablePricing,
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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

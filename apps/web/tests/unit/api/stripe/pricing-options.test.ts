import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stripe/config', () => ({
  STRIPE_PRICES: {
    pro_monthly: 'price_monthly',
    pro_yearly: 'price_yearly',
  },
  PRICING_OPTIONS: [
    { id: 'pro_monthly', name: 'Pro Monthly', price: 9.99 },
    { id: 'pro_yearly', name: 'Pro Yearly', price: 99.99 },
  ],
}));

describe('GET /api/stripe/pricing-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns pricing options', async () => {
    const { GET } = await import('@/app/api/stripe/pricing-options/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.options).toBeDefined();
    expect(Array.isArray(data.options)).toBe(true);
  });
});

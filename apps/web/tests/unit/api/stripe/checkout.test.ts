import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());
const mockCreateBillingPortalSession = vi.hoisted(() => vi.fn());
const mockEnsureStripeCustomer = vi.hoisted(() => vi.fn());
const mockGetActivePriceIds = vi.hoisted(() => vi.fn());
const mockGetPriceMappingDetails = vi.hoisted(() => vi.fn());
const mockIsGrowthPlanEnabled = vi.hoisted(() => vi.fn());
const mockIsGrowthPriceId = vi.hoisted(() => vi.fn());
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

vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: mockGetActivePriceIds,
  getPriceMappingDetails: mockGetPriceMappingDetails,
  isGrowthPlanEnabled: mockIsGrowthPlanEnabled,
  isGrowthPriceId: mockIsGrowthPriceId,
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
    mockIsGrowthPlanEnabled.mockReturnValue(true);
    mockIsGrowthPriceId.mockReturnValue(false);
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

  it('returns 403 when growth plan is disabled', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetActivePriceIds.mockReturnValue(['price_growth']);
    mockIsGrowthPlanEnabled.mockReturnValue(false);
    mockIsGrowthPriceId.mockReturnValue(true);

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_growth' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Growth plan is not currently available',
    });
  });

  it('creates checkout session for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
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
});

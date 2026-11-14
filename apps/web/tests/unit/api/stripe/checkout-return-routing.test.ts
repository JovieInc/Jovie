import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordArtistOfferStage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mockRecordArtistOfferStage,
}));

const mockRevenueFailure = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: mockRevenueFailure,
}));

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

vi.mock('@/lib/error-tracking', async () => {
  // parseJsonBody uses captureError/captureWarning internally — we only want
  // to spy on captureCriticalError (the fatal pager), so preserve the rest.
  const actual = await vi.importActual<typeof import('@/lib/error-tracking')>(
    '@/lib/error-tracking'
  );
  return {
    ...actual,
    captureCriticalError: mockCaptureCriticalError,
  };
});

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

describe('In-app checkout return routing', () => {
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
    mockWithStripeRetry.mockImplementation(async (_operation, fn) => fn());
  });
  it('returns in-app upgrades to their screen without claiming entitlement', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_in_app',
      url: 'https://checkout.stripe.com/pay/cs_in_app',
    });
    const makeRequest = (returnTo: string) =>
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: 'price_123',
          source: 'in_app',
          returnTo,
          humanConfirmed: true,
        }),
      });
    expect((await POST(makeRequest('/app/releases?release=123'))).status).toBe(
      200
    );
    const first = mockCreateCheckoutSession.mock.calls.at(-1)?.[0];
    expect(first.successUrl).toMatch(/\/app\/releases\?release=123$/);
    expect(first.cancelUrl).toBe(first.successUrl);
    expect((await POST(makeRequest('/app/profiles'))).status).toBe(200);
    expect(
      mockCreateCheckoutSession.mock.calls.at(-1)?.[0].idempotencyKey
    ).not.toBe(first.idempotencyKey);
    expect((await POST(makeRequest('//evil.test'))).status).toBe(200);
    expect(mockCreateCheckoutSession.mock.calls.at(-1)?.[0].successUrl).toMatch(
      /\/app$/
    );
  });
});

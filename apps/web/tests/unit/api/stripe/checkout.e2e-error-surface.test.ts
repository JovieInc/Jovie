import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as errorTracking from '@/lib/error-tracking';

// Focused E2E-error-surface coverage for POST /api/stripe/checkout, split out
// of checkout.test.ts to stay inside that file's size-500 budget. Pins the
// JOV-8805 disclosure ordering fixed after the 2026-11-17..19 dogfood red:
// the E2E_TEST_MODE disclosure must run BEFORE the getCheckoutErrorResponse
// substring map, which otherwise collapses any error containing "price"
// (all of the price-lock fail-closed errors) into a masked 400.

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
const mockRecordArtistOfferStage = vi.hoisted(() => vi.fn());
const mockRevenueFailure = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi
  .spyOn(errorTracking, 'captureCriticalError')
  .mockResolvedValue(undefined);

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock(
  '@/lib/billing/price-lock.server',
  () => import('@/tests/fixtures/price-lock-list-mock')
);
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
  PRICE_MAPPINGS: {},
}));
vi.mock('@/lib/stripe/retry', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/stripe/retry')>();
  return {
    ...actual,
    withStripeRetry: mockWithStripeRetry,
  };
});
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mockRecordArtistOfferStage,
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: mockRevenueFailure,
}));

import { POST } from '@/app/api/stripe/checkout/route';

describe('JOV-8805: checkout error surfacing under E2E_TEST_MODE', () => {
  // Price-lock fail-closed errors contain "price"; under the dogfood flag the
  // real cause must win over the substring 400 mask (red 2026-11-17..19).
  const PRICE_DOMAIN_ERROR = new Error(
    'The locked price exceeds the requested offer; select the locked price explicitly'
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMaxPlanEnabled.mockReturnValue(true);
    mockIsMaxPriceId.mockReturnValue(false);
    mockGetActivePriceIds.mockReturnValue(['price_123']);
    mockGetPriceMappingDetails.mockReturnValue(null);
    mockEnsureStripeCustomer.mockResolvedValue({
      success: true,
      customerId: 'cus_123',
    });
    mockStripeSubscriptionsList.mockResolvedValue({ data: [] });
    mockWithStripeRetry.mockImplementation(async (_operation, fn) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function postCheckout() {
    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_123' }),
      })
    );
    return { status: response.status, data: await response.json() };
  }

  it('names a price-domain error under E2E_TEST_MODE=1 instead of masking it', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockRejectedValue(PRICE_DOMAIN_ERROR);

    const { status, data } = await postCheckout();

    expect(status).toBe(500);
    expect(data.error).toBe(
      `Failed to create checkout session: ${PRICE_DOMAIN_ERROR.message}`
    );
  });

  it('keeps the price-substring 400 mapping outside E2E_TEST_MODE', async () => {
    // Prod contract is unchanged: a thrown price-domain error still maps to
    // the customer-safe 400 body.
    vi.stubEnv('E2E_TEST_MODE', '');
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockRejectedValue(PRICE_DOMAIN_ERROR);

    const { status, data } = await postCheckout();

    expect(status).toBe(400);
    expect(data.error).toBe('Invalid pricing configuration');
  });

  it('keeps the generic 500 body when the flag is set but the error is empty', async () => {
    vi.stubEnv('E2E_TEST_MODE', '1');
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCreateCheckoutSession.mockRejectedValue(new Error(''));

    const { status, data } = await postCheckout();

    expect(status).toBe(500);
    expect(data.error).toBe('Failed to create checkout session');
    expect(mockCaptureCriticalError).toHaveBeenCalled();
  });
});

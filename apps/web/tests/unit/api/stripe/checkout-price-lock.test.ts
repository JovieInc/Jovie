// Price lock on checkout (JOV-INV-048): split from checkout.test.ts, which
// is at its size-500 baseline. Same route, same module boundaries.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());
const mockGetActivePriceIds = vi.hoisted(() => vi.fn());
const mockGetPriceMappingDetails = vi.hoisted(() => vi.fn());
const mockResolveCheckoutPriceForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: vi.fn(),
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/error-tracking', async () => ({
  ...(await vi.importActual<typeof import('@/lib/error-tracking')>(
    '@/lib/error-tracking'
  )),
  captureCriticalError: vi.fn(),
}));
vi.mock('@/lib/billing/price-lock.server', () => ({
  resolveCheckoutPriceForUser: mockResolveCheckoutPriceForUser,
}));
vi.mock('@/lib/stripe/client', () => ({
  createCheckoutSession: mockCreateCheckoutSession,
  createBillingPortalSession: vi.fn(),
  stripe: { subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) } },
}));
vi.mock('@/lib/stripe/customer-sync', () => ({
  ensureStripeCustomer: vi
    .fn()
    .mockResolvedValue({ success: true, customerId: 'cus_123' }),
}));
vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: mockGetActivePriceIds,
  getPriceMappingDetails: mockGetPriceMappingDetails,
  isMaxPlanEnabled: () => true,
  isMaxPriceId: () => false,
  PRICE_MAPPINGS: {},
}));
vi.mock('@/lib/stripe/retry', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/stripe/retry')>()),
  withStripeRetry: async (_operation: string, fn: () => Promise<unknown>) =>
    fn(),
}));

import { POST } from '@/app/api/stripe/checkout/route';

const LIST_LOCK = {
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_123',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
};

describe('POST /api/stripe/checkout price lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveCheckoutPriceForUser.mockImplementation(
      async (_userId: string, priceId: string) => ({
        decision: { kind: 'list', priceId },
        lock: LIST_LOCK,
      })
    );
    mockGetActivePriceIds.mockReturnValue(['price_123']);
    mockGetPriceMappingDetails.mockReturnValue({
      priceId: 'price_123',
      plan: 'standard',
      amount: 500,
      currency: 'usd',
      interval: 'month',
      description: 'Standard Monthly',
    });
  });

  const lockedDecision = (substituted: boolean) => ({
    decision: {
      kind: 'locked',
      priceId: 'price_locked_12',
      plan: 'pro',
      expectation: { amountCents: 1200, currency: 'usd', interval: 'month' },
      substituted,
    },
    lock: LIST_LOCK,
  });

  it('charges the locked price, not the list price the browser sent', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockResolveCheckoutPriceForUser.mockResolvedValue(lockedDecision(true));
    mockGetPriceMappingDetails.mockImplementation((id: string) =>
      id === 'price_locked_12'
        ? {
            priceId: id,
            plan: 'pro',
            amount: 1200,
            currency: 'usd',
            interval: 'month',
            description: 'Artist Presence',
          }
        : null
    );
    // The locked price is retired from the active list.
    mockGetActivePriceIds.mockReturnValue(['price_list_19']);
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_locked',
      url: 'https://checkout.stripe.com/pay/cs_locked',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_list_19' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockResolveCheckoutPriceForUser).toHaveBeenCalledWith(
      'user_123',
      'price_list_19'
    );
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_locked_12',
        plan: 'pro',
        lockedPrice: {
          amountCents: 1200,
          currency: 'usd',
          interval: 'month',
        },
      })
    );
  });

  it('fails closed when the lock cannot be read or created', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockResolveCheckoutPriceForUser.mockRejectedValue(new Error('db down'));

    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_123' }),
      })
    );

    expect(response.status).toBe(500);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('keeps validating list prices for a person whose lock does not apply', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetActivePriceIds.mockReturnValue(['price_other']);

    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_123' }),
      })
    );

    expect(response.status).toBe(400);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMerchCheckoutSessionMock,
  getAppFlagValueMock,
  limiterMock,
  parseJsonBodyMock,
} = vi.hoisted(() => ({
  createMerchCheckoutSessionMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  limiterMock: vi.fn(),
  parseJsonBodyMock: vi.fn(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: parseJsonBodyMock,
}));

vi.mock('@/lib/merch/orders', () => ({
  createMerchCheckoutSession: createMerchCheckoutSessionMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: () => ({ 'X-RateLimit-Remaining': '9' }),
  getClientIP: () => '203.0.113.10',
  merchCheckoutLimiter: {
    limit: limiterMock,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const routeModulePromise = import('@/app/api/merch/checkout/route');

function checkoutRequest() {
  return new Request('https://jov.ie/api/merch/checkout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

const checkoutPayload = {
  merchCardId: '00000000-0000-4000-8000-000000000001',
  variantKey: 'M_black',
  quantity: 1,
  handle: 'testartist',
};

describe('POST /api/merch/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiterMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    parseJsonBodyMock.mockResolvedValue({
      ok: true,
      data: checkoutPayload,
    });
    getAppFlagValueMock.mockResolvedValue(true);
    createMerchCheckoutSessionMock.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.test/session',
    });
  });

  it('creates a checkout session when merch is enabled', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: 'https://checkout.stripe.test/session',
    });
    expect(getAppFlagValueMock).toHaveBeenCalledWith('MERCH_MVP', {
      userId: null,
    });
    expect(createMerchCheckoutSessionMock).toHaveBeenCalledWith(
      checkoutPayload
    );
  });

  it('returns not found when the merch kill switch is off', async () => {
    getAppFlagValueMock.mockResolvedValueOnce(false);

    const { POST } = await routeModulePromise;
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Merch checkout is not available.',
    });
    expect(createMerchCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('maps unsellable merch cards to a conflict response', async () => {
    createMerchCheckoutSessionMock.mockRejectedValueOnce(
      new Error('card is not sellable')
    );

    const { POST } = await routeModulePromise;
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'This merch item is not currently sellable.',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUserBillingInfoMock: vi.fn(),
  getEntitlementsMock: vi.fn(),
  getRedisMock: vi.fn(),
  getStatusMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: hoisted.getUserBillingInfoMock,
}));

vi.mock('@/lib/entitlements/registry', async () => {
  // Preserve real exports (including `resolveChatUsagePlan`, extracted from
  // the route in 45ef3d68) while only substituting `getEntitlements`.
  const actual = await vi.importActual<
    typeof import('@/lib/entitlements/registry')
  >('@/lib/entitlements/registry');
  return {
    ...actual,
    getEntitlements: hoisted.getEntitlementsMock,
  };
});

vi.mock('@/lib/redis', () => ({
  getRedis: hoisted.getRedisMock,
}));

vi.mock('@/lib/rate-limit/limiters', () => ({
  aiChatDailyPlanAwareLimiter: {
    getStatus: hoisted.getStatusMock,
  },
}));

vi.mock('@/lib/http/headers', () => ({
  RETRY_AFTER_SERVICE: '30',
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

describe('GET /api/chat/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getRedisMock.mockReturnValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns usage snapshot for authenticated user on free plan', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { plan: 'free' },
    });
    hoisted.getEntitlementsMock.mockReturnValue({
      limits: { aiDailyMessageLimit: 10 },
    });
    hoisted.getStatusMock.mockReturnValue({ remaining: 7 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toBe('free');
    expect(body.dailyLimit).toBe(10);
    expect(body.remaining).toBe(7);
    expect(body.used).toBe(3);
    expect(body.isExhausted).toBe(false);
  });

  it('returns usage for pro plan with correct warning threshold', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { plan: 'pro' },
    });
    hoisted.getEntitlementsMock.mockReturnValue({
      limits: { aiDailyMessageLimit: 50 },
    });
    hoisted.getStatusMock.mockReturnValue({ remaining: 4 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.plan).toBe('pro');
    expect(body.warningThreshold).toBe(5);
    expect(body.isNearLimit).toBe(true);
  });

  it('returns 503 when billing unavailable and no cache', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({ success: false });
    hoisted.getRedisMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(503);
  });

  it('returns stale cached data when billing unavailable', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({ success: false });

    const cachedSnapshot = {
      plan: 'free',
      dailyLimit: 10,
      used: 5,
      remaining: 5,
      isExhausted: false,
      warningThreshold: 2,
      isNearLimit: false,
    };
    hoisted.getRedisMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(cachedSnapshot),
    });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body._stale).toBe(true);
    expect(body.plan).toBe('free');
  });

  it('marks isExhausted when remaining is 0', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getUserBillingInfoMock.mockResolvedValue({
      success: true,
      data: { plan: 'free' },
    });
    hoisted.getEntitlementsMock.mockReturnValue({
      limits: { aiDailyMessageLimit: 10 },
    });
    hoisted.getStatusMock.mockReturnValue({ remaining: 0 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.isExhausted).toBe(true);
    expect(body.remaining).toBe(0);
    expect(body.used).toBe(10);
  });
});

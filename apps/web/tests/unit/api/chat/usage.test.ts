import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getRedisMock: vi.fn(),
  getStatusMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: hoisted.getRedisMock,
}));

vi.mock('@/lib/rate-limit/limiters', () => ({
  aiChatDailyPlanAwareLimiter: {
    getStatus: hoisted.getStatusMock,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function makeEntitlements(
  overrides: Partial<{
    plan: 'free' | 'trial' | 'pro' | 'max' | 'founding' | 'growth';
    billingVerification: 'verified' | 'unavailable' | 'missing_user';
    isAuthenticated: boolean;
    userId: string | null;
  }> = {}
) {
  const plan = overrides.plan ?? 'free';
  const ent =
    ENTITLEMENT_REGISTRY[
      plan === 'founding'
        ? 'pro'
        : plan === 'growth'
          ? 'max'
          : plan === 'trial'
            ? 'trial'
            : plan
    ];
  return {
    userId: overrides.userId ?? 'user_123',
    email: 'artist@example.com',
    isAuthenticated: overrides.isAuthenticated ?? true,
    isAdmin: false,
    plan,
    isPro: plan !== 'free',
    hasAdvancedFeatures: plan === 'max' || plan === 'growth',
    billingVerification: overrides.billingVerification ?? 'verified',
    ...ent.booleans,
    ...ent.limits,
  };
}

describe('GET /api/chat/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getRedisMock.mockReturnValue(null);
    hoisted.getStatusMock.mockReturnValue({
      remaining: 7,
      resetTime: Date.UTC(2026, 4, 23, 7, 0, 0),
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns usage snapshot for authenticated user on free plan', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'free' })
    );

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toBe('free');
    expect(body.dailyLimit).toBe(10);
    expect(body.remaining).toBe(7);
    expect(body.used).toBe(3);
    expect(body.resetAt).toBe('2026-05-23T07:00:00.000Z');
    expect(body.monthlyLimit).toBeGreaterThanOrEqual(280);
    expect(body.monthlyUsed).toBe(3);
    expect(body.monthlyRemaining).toBe(body.monthlyLimit - 3);
    expect(body.monthlyResetAt).toMatch(/T00:00:00\.000Z$/);
    expect(body.isExhausted).toBe(false);
  });

  it('returns usage for pro plan with correct warning threshold', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'pro' })
    );
    hoisted.getStatusMock.mockReturnValue({ remaining: 4, resetTime: 0 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.plan).toBe('pro');
    expect(body.dailyLimit).toBe(100);
    expect(body.warningThreshold).toBe(5);
    expect(body.isNearLimit).toBe(true);
    expect(hoisted.getStatusMock).toHaveBeenCalledWith('user_123', 'pro');
  });

  it('normalizes isPro-backed pro entitlements to pro usage limits', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'pro' })
    );
    hoisted.getStatusMock.mockReturnValue({ remaining: 88, resetTime: 0 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.plan).toBe('pro');
    expect(body.dailyLimit).toBe(100);
    expect(body.remaining).toBe(88);
  });

  it('returns degraded usage when billing is unavailable and no cache', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        plan: 'free',
        billingVerification: 'unavailable',
      })
    );

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body._stale).toBe(true);
    expect(body.plan).toBe('free');
    expect(body.dailyLimit).toBe(10);
  });

  it('returns stale cached data when billing is unavailable', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        plan: 'pro',
        billingVerification: 'unavailable',
      })
    );

    const cachedSnapshot = {
      plan: 'pro',
      dailyLimit: 100,
      used: 5,
      remaining: 95,
      isExhausted: false,
      warningThreshold: 5,
      isNearLimit: false,
      monthlyLimit: 3100,
      monthlyUsed: 5,
      monthlyRemaining: 3095,
      monthlyResetAt: '2026-07-01T00:00:00.000Z',
    };
    hoisted.getRedisMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(cachedSnapshot),
    });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body._stale).toBe(true);
    expect(body.plan).toBe('pro');
    expect(body.remaining).toBe(95);
  });

  it('marks isExhausted when remaining is 0', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'free' })
    );
    hoisted.getStatusMock.mockReturnValue({ remaining: 0, resetTime: 0 });

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.isExhausted).toBe(true);
    expect(body.remaining).toBe(0);
    expect(body.used).toBe(10);
  });
});

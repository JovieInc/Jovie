import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENTITLEMENT_REGISTRY,
  getEntitlements,
  resolveChatUsagePlan,
} from '@/lib/entitlements/registry';

import type { UserPlan } from '@/types';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getRedisMock: vi.fn(),
  getStatusMock: vi.fn(),
  readStatusMock: vi.fn(),
  consumeMock: vi.fn(),
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
  aiChatWeeklyPlanAwareLimiter: {
    getStatus: hoisted.getStatusMock,
    readStatus: hoisted.readStatusMock,
    limit: hoisted.consumeMock,
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

const now = Date.UTC(2026, 9, 3, 16);
const resetTime = now + 86_400_000;
const snapshot = {
  plan: 'free',
  weeklyLimit: 15,
  used: 8,
  remaining: 7,
  resetAt: new Date(resetTime).toISOString(),
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: false,
  observedAt: now,
};
function entitlements(
  plan: UserPlan = 'free',
  billingVerification = 'verified'
) {
  return makeEntitlements({
    plan,
    billingVerification: billingVerification as 'verified' | 'unavailable',
  });
}
function cache(value: unknown) {
  const redis = {
    get: vi.fn().mockResolvedValue(value),
    set: vi.fn().mockResolvedValue('OK'),
  };
  hoisted.getRedisMock.mockReturnValue(redis);
  return redis;
}
async function request() {
  const { GET } = await import('@/app/api/chat/usage/route');
  return GET();
}
function liveStatus(remaining: number, limit = 15) {
  return {
    available: true,
    backend: 'redis',
    limit,
    remaining,
    resetTime,
    observedAt: now,
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(makeEntitlements());
  hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
  hoisted.getRedisMock.mockReturnValue(null);
  hoisted.readStatusMock.mockResolvedValue(liveStatus(7));
});

describe('GET /api/chat/usage', () => {
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
    expect(body.weeklyLimit).toBe(15);
    expect(body.remaining).toBe(7);
    expect(body.used).toBe(8);
    expect(body.resetAt).toBe(new Date(resetTime).toISOString());
    expect(body.warningThreshold).toBe(3);
    expect(body.isExhausted).toBe(false);
  });

  it('returns trial plan with the trial weekly quota instead of Free copy', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'trial' })
    );
    hoisted.readStatusMock.mockResolvedValue(liveStatus(12, 50));

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.plan).toBe('trial');
    expect(body.weeklyLimit).toBe(50);
    expect(body.remaining).toBe(12);
    expect(body.used).toBe(38);
    expect(body.warningThreshold).toBe(10);
    expect(hoisted.readStatusMock).toHaveBeenCalledWith('user_123', 'trial');
  });

  it('returns usage for pro plan with correct warning threshold', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'pro' })
    );
    hoisted.readStatusMock.mockResolvedValue(liveStatus(4, 70));

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.plan).toBe('pro');
    expect(body.weeklyLimit).toBe(70);
    expect(body.warningThreshold).toBe(14);
    expect(body.isNearLimit).toBe(true);
    expect(hoisted.readStatusMock).toHaveBeenCalledWith('user_123', 'pro');
  });

  it('rejects a malformed observation above the verified plan limit', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'pro' })
    );
    hoisted.readStatusMock.mockResolvedValue(liveStatus(88, 70));

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Usage unavailable' });
  });

  it('returns pro limits for isPro rows with missing raw plan via entitlements (#11365)', async () => {
    // Pre-fix route used resolveChatUsagePlan(billing.data?.plan), which maps null →
    // free (10/day). Paid users with isPro=true but no plan string saw wrong/blank meters.
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      ...makeEntitlements({ plan: 'pro' }),
      billingPlanMismatch: {
        rawPlan: null,
        normalizedPlan: 'pro',
        reason: 'is_pro_true_with_non_paid_plan',
      },
    });
    hoisted.readStatusMock.mockResolvedValue(liveStatus(42, 70));

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toBe('pro');
    expect(body.weeklyLimit).toBe(70);
    expect(body.used).toBe(28);
    expect(body.remaining).toBe(42);
  });

  it('returns unavailable usage when billing is unavailable and no cache', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({
        plan: 'free',
        billingVerification: 'unavailable',
      })
    );

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Usage unavailable' });
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
      observedAt: now,
      resetAt: new Date(resetTime).toISOString(),
      weeklyLimit: 75,
      used: 5,
      remaining: 70,
      isExhausted: false,
      warningThreshold: 15,
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
    expect(body.plan).toBe('pro');
    expect(body.remaining).toBe(70);
  });

  it('marks isExhausted when remaining is 0', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      makeEntitlements({ plan: 'free' })
    );
    hoisted.readStatusMock.mockResolvedValue(liveStatus(0, 15));

    const { GET } = await import('@/app/api/chat/usage/route');
    const response = await GET();

    const body = await response.json();
    expect(body.isExhausted).toBe(true);
    expect(body.remaining).toBe(0);
    expect(body.used).toBe(15);
  });
});

describe('GET /api/chat/usage authoritative snapshots', () => {
  it('reads the enforcement bucket without consuming quota or consulting memory', async () => {
    const redis = cache(null);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(hoisted.readStatusMock).toHaveBeenCalledWith('user_123', 'free');
    expect(hoisted.getStatusMock).not.toHaveBeenCalled();
    expect(hoisted.consumeMock).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      'chat:usage:v3:user_123',
      JSON.stringify(snapshot),
      { ex: 3600 }
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it.each<UserPlan>(['free', 'trial', 'pro', 'max', 'founding', 'growth'])(
    'preserves the existing %s allowance and plan mapping',
    async plan => {
      const limit = getEntitlements(plan).limits.aiWeeklyMessageLimit;
      hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
        entitlements(plan)
      );
      hoisted.readStatusMock.mockResolvedValue(liveStatus(4, limit));
      const response = await request();
      expect(await response.json()).toMatchObject({
        plan: resolveChatUsagePlan(plan),
        weeklyLimit: limit,
        remaining: 4,
        used: limit - 4,
        warningThreshold: Math.max(1, Math.ceil(limit * 0.2)),
      });
      expect(hoisted.readStatusMock).toHaveBeenCalledWith('user_123', plan);
    }
  );

  it('preserves absent reset time for intentionally selected unused memory', async () => {
    hoisted.readStatusMock.mockResolvedValue({
      ...liveStatus(15),
      backend: 'memory',
      resetTime: null,
    });
    expect(await (await request()).json()).toMatchObject({
      used: 0,
      resetAt: null,
    });
  });
  it.each(['billing', 'quota'])(
    'returns validated cached counts, labeled stale, when %s is unavailable',
    async failure => {
      if (failure === 'billing')
        hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
          entitlements('free', 'unavailable')
        );
      else
        hoisted.readStatusMock.mockResolvedValue({
          available: false,
          backend: 'unavailable',
        });
      const redis = cache(JSON.stringify(snapshot));
      const response = await request();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...snapshot, _stale: true });
      expect(redis.get).toHaveBeenCalledWith('chat:usage:v3:user_123');
      expect(redis.set).not.toHaveBeenCalled();
      if (failure === 'billing')
        expect(hoisted.readStatusMock).not.toHaveBeenCalled();
    }
  );
  it.each(['billing', 'quota', 'throw', 'mismatched-limit'])(
    'returns unavailable without fabricated numbers on %s failure without cache',
    async failure => {
      if (failure === 'billing')
        hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
          entitlements('free', 'unavailable')
        );
      else if (failure === 'throw')
        hoisted.readStatusMock.mockRejectedValue(new Error('read failed'));
      else if (failure === 'mismatched-limit')
        hoisted.readStatusMock.mockResolvedValue(liveStatus(60, 70));
      else
        hoisted.readStatusMock.mockResolvedValue({
          available: false,
          backend: 'unavailable',
        });
      const response = await request();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Usage unavailable' });
      expect(hoisted.getStatusMock).not.toHaveBeenCalled();
    }
  );
  it.each([
    null,
    '{bad json',
    { ...snapshot, observedAt: undefined },
    { ...snapshot, observedAt: now - 3600001 },
    { ...snapshot, observedAt: now + 1 },
    { ...snapshot, remaining: 999 },
    { ...snapshot, used: -1 },
    { ...snapshot, weeklyLimit: null },
    { ...snapshot, resetAt: 'invalid' },
    { ...snapshot, isExhausted: true },
    { ...snapshot, plan: 'unknown' },
  ])('rejects unverified cache %j', async cached => {
    cache(cached);
    hoisted.readStatusMock.mockResolvedValue({
      available: false,
      backend: 'unavailable',
    });
    expect((await request()).status).toBe(503);
  });
  it('does not return old plan counts when verified entitlements changed', async () => {
    cache(snapshot);
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue(
      entitlements('pro')
    );
    hoisted.readStatusMock.mockResolvedValue({
      available: false,
      backend: 'unavailable',
    });
    expect((await request()).status).toBe(503);
  });
  it('handles cache read failure without returning false availability', async () => {
    const redis = cache(null);
    redis.get.mockRejectedValue(new Error('cache unavailable'));
    hoisted.readStatusMock.mockResolvedValue({
      available: false,
      backend: 'unavailable',
    });
    expect((await request()).status).toBe(503);
  });
  it('keeps a fresh observation usable when the advisory cache write fails', async () => {
    const redis = cache(null);
    redis.set.mockRejectedValue(new Error('cache unavailable'));
    expect((await request()).status).toBe(200);
  });

  it('rejects unauthenticated entitlements', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      ...entitlements(),
      isAuthenticated: false,
    });
    expect((await request()).status).toBe(401);
    expect(hoisted.readStatusMock).not.toHaveBeenCalled();
  });
  it('keeps a fresh observation if the cache client throws synchronously', async () => {
    hoisted.getRedisMock.mockImplementation(() => {
      throw new Error('cache init failed');
    });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
  });
  it('bounds a hanging cache fallback and returns unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    hoisted.readStatusMock.mockResolvedValue({
      available: false,
      backend: 'unavailable',
    });
    cache(null).get.mockReturnValue(new Promise(() => {}));
    const { GET } = await import('@/app/api/chat/usage/route');
    const response = GET();
    await vi.advanceTimersByTimeAsync(750);
    expect((await response).status).toBe(503);
  });
  it.each([
    { remaining: -1 },
    { remaining: 16 },
    { remaining: Number.NaN },
    { observedAt: now + 1 },
    { resetTime: Number.NaN },
  ])('does not publish malformed live observations %j', async invalid => {
    hoisted.readStatusMock.mockResolvedValue({ ...liveStatus(7), ...invalid });
    expect((await request()).status).toBe(503);
  });
  it('returns 401 when authentication middleware is unavailable', async () => {
    hoisted.getCachedAuthMock.mockRejectedValue(
      new Error('clerkMiddleware missing')
    );
    expect((await request()).status).toBe(401);
    expect(hoisted.readStatusMock).not.toHaveBeenCalled();
  });
  it('does not hide unrelated authentication failures', async () => {
    hoisted.getCachedAuthMock.mockRejectedValue(
      new Error('auth transport failed')
    );
    await expect(request()).rejects.toThrow('auth transport failed');
    expect(hoisted.readStatusMock).not.toHaveBeenCalled();
  });
});

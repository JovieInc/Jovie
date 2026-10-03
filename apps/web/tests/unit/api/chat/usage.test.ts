import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEntitlements,
  resolveChatUsagePlan,
} from '@/lib/entitlements/registry';
import type { UserPlan } from '@/types';

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  entitlements: vi.fn(),
  redis: vi.fn(),
  read: vi.fn(),
  legacy: vi.fn(),
  consume: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: h.auth }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: h.entitlements,
}));
vi.mock('@/lib/redis', () => ({ getRedis: h.redis }));
vi.mock('@/lib/rate-limit/limiters', () => ({
  aiChatWeeklyPlanAwareLimiter: {
    readStatus: h.read,
    getStatus: h.legacy,
    limit: h.consume,
  },
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));
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
  return {
    isAuthenticated: true,
    userId: 'user_123',
    plan,
    billingVerification,
  };
}
function cache(value: unknown) {
  const redis = {
    get: vi.fn().mockResolvedValue(value),
    set: vi.fn().mockResolvedValue('OK'),
  };
  h.redis.mockReturnValue(redis);
  return redis;
}
async function request() {
  const { GET } = await import('@/app/api/chat/usage/route');
  return GET();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  h.auth.mockResolvedValue({ userId: 'user_123' });
  h.entitlements.mockResolvedValue(entitlements());
  h.redis.mockReturnValue(null);
  h.read.mockResolvedValue({
    available: true,
    backend: 'redis',
    limit: 15,
    remaining: 7,
    resetTime,
    observedAt: now,
  });
  h.legacy.mockReturnValue({ remaining: 15, resetTime });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('GET /api/chat/usage authoritative snapshots', () => {
  it('reads the enforcement bucket without consuming quota or consulting memory', async () => {
    const redis = cache(null);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(h.read).toHaveBeenCalledWith('user_123', 'free');
    expect(h.legacy).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
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
      h.entitlements.mockResolvedValue(entitlements(plan));
      h.read.mockResolvedValue({
        available: true,
        backend: 'redis',
        limit,
        remaining: 4,
        resetTime,
        observedAt: now,
      });
      const response = await request();
      expect(await response.json()).toMatchObject({
        plan: resolveChatUsagePlan(plan),
        weeklyLimit: limit,
        remaining: 4,
        used: limit - 4,
        warningThreshold: Math.max(1, Math.ceil(limit * 0.2)),
      });
      expect(h.read).toHaveBeenCalledWith('user_123', plan);
    }
  );
  it('retains normalized paid entitlements even when the raw billing plan was absent', async () => {
    h.entitlements.mockResolvedValue({
      ...entitlements('pro'),
      billingPlanMismatch: { rawPlan: null },
    });
    h.read.mockResolvedValue({
      available: true,
      backend: 'redis',
      limit: 70,
      remaining: 42,
      resetTime,
      observedAt: now,
    });
    expect(await (await request()).json()).toMatchObject({
      plan: 'pro',
      weeklyLimit: 70,
      used: 28,
    });
  });
  it('reports a real exhausted balance', async () => {
    h.read.mockResolvedValue({
      available: true,
      backend: 'redis',
      limit: 15,
      remaining: 0,
      resetTime,
      observedAt: now,
    });
    expect(await (await request()).json()).toMatchObject({
      remaining: 0,
      used: 15,
      isExhausted: true,
    });
  });
  it('preserves absent reset time for intentionally selected unused memory', async () => {
    h.read.mockResolvedValue({
      available: true,
      backend: 'memory',
      limit: 15,
      remaining: 15,
      resetTime: null,
      observedAt: now,
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
        h.entitlements.mockResolvedValue(entitlements('free', 'unavailable'));
      else
        h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
      const redis = cache(JSON.stringify(snapshot));
      const response = await request();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...snapshot, _stale: true });
      expect(redis.get).toHaveBeenCalledWith('chat:usage:v3:user_123');
      expect(redis.set).not.toHaveBeenCalled();
      if (failure === 'billing') expect(h.read).not.toHaveBeenCalled();
    }
  );
  it.each(['billing', 'quota', 'throw', 'mismatched-limit'])(
    'returns unavailable without fabricated numbers on %s failure without cache',
    async failure => {
      if (failure === 'billing')
        h.entitlements.mockResolvedValue(entitlements('free', 'unavailable'));
      else if (failure === 'throw')
        h.read.mockRejectedValue(new Error('read failed'));
      else if (failure === 'mismatched-limit')
        h.read.mockResolvedValue({
          available: true,
          backend: 'redis',
          limit: 70,
          remaining: 60,
          resetTime,
          observedAt: now,
        });
      else
        h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
      const response = await request();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Usage unavailable' });
      expect(h.legacy).not.toHaveBeenCalled();
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
    h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
    expect((await request()).status).toBe(503);
  });
  it('does not return old plan counts when verified entitlements changed', async () => {
    cache(snapshot);
    h.entitlements.mockResolvedValue(entitlements('pro'));
    h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
    expect((await request()).status).toBe(503);
  });
  it('handles cache read failure without returning false availability', async () => {
    const redis = cache(null);
    redis.get.mockRejectedValue(new Error('cache unavailable'));
    h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
    expect((await request()).status).toBe(503);
  });
  it('keeps a fresh observation usable when the advisory cache write fails', async () => {
    const redis = cache(null);
    redis.set.mockRejectedValue(new Error('cache unavailable'));
    expect((await request()).status).toBe(200);
  });
  it('does not read usage for an unauthenticated user', async () => {
    h.auth.mockResolvedValue({ userId: null });
    expect((await request()).status).toBe(401);
    expect(h.read).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated entitlements', async () => {
    h.entitlements.mockResolvedValue({
      ...entitlements(),
      isAuthenticated: false,
    });
    expect((await request()).status).toBe(401);
    expect(h.read).not.toHaveBeenCalled();
  });
  it('keeps a fresh observation if the cache client throws synchronously', async () => {
    h.redis.mockImplementation(() => {
      throw new Error('cache init failed');
    });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
  });
  it('bounds a hanging cache fallback and returns unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.read.mockResolvedValue({ available: false, backend: 'unavailable' });
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
    h.read.mockResolvedValue({
      available: true,
      backend: 'redis',
      limit: 15,
      remaining: 7,
      resetTime,
      observedAt: now,
      ...invalid,
    });
    expect((await request()).status).toBe(503);
  });
  it('returns 401 when authentication middleware is unavailable', async () => {
    h.auth.mockRejectedValue(new Error('clerkMiddleware missing'));
    expect((await request()).status).toBe(401);
    expect(h.read).not.toHaveBeenCalled();
  });
  it('does not hide unrelated authentication failures', async () => {
    h.auth.mockRejectedValue(new Error('auth transport failed'));
    await expect(request()).rejects.toThrow('auth transport failed');
    expect(h.read).not.toHaveBeenCalled();
  });
});

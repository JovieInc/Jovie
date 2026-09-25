/**
 * Redis commands on the session, admin, and public-artist paths.
 *
 * Counts are produced by executing the current functions, Better Auth's
 * session route, Upstash Ratelimit, and the pre-change admin Redis body
 * from `apps/web/lib/admin/roles.ts` at 6c65244. That body was removed in
 * this branch, so the test runs it here instead of shelling out to git.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getSessionCookie } from 'better-auth/cookies';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldUseEssentialShellData } from '@/app/app/(shell)/shell-route-matches';

const { mockGetSession, mockGetRedis, mockHeaders, mockGetBilling } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetRedis: vi.fn(),
    mockHeaders: vi.fn(),
    mockGetBilling: vi.fn(),
  }));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      const values = new Map<string, ReturnType<T>>();
      return ((...args: never[]) => {
        const key = JSON.stringify(args);
        const existing = values.get(key);
        if (existing !== undefined) return existing;
        const value = fn(...args) as ReturnType<T>;
        values.set(key, value);
        return value;
      }) as T;
    },
  };
});

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: vi.fn(async () => ({
    id: 'app-user-1',
    userStatus: 'active',
    deletedAt: null,
  })),
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: vi.fn(async () => null),
  buildDevTestAuthCurrentUser: vi.fn(),
}));

vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('@/lib/redis', () => ({
  redis: null,
  getRedis: mockGetRedis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetBilling,
}));

interface CommandTally {
  get: number;
  set: number;
  del: number;
  evalsha: number;
  eval: number;
}

function emptyTally(): CommandTally {
  return { get: 0, set: 0, del: 0, evalsha: 0, eval: 0 };
}

function totalCommands(tally: CommandTally): number {
  return tally.get + tally.set + tally.del + tally.evalsha + tally.eval;
}

/**
 * `tryRedisPath` from `apps/web/lib/admin/roles.ts` at 6c65244.
 * A cached value other than "1" returned immediately. "1" and misses
 * rechecked Postgres and then SET the result.
 */
async function tryRedisPathAt6c65244(
  cacheKey: string,
  redis: { get: (key: string) => Promise<unknown>; set: Function },
  queryAdminRoleFromDB: () => Promise<boolean>
): Promise<boolean> {
  const cached = await redis.get(cacheKey);
  if (cached !== null && String(cached) !== '1') {
    return false;
  }

  const isUserAdmin = await queryAdminRoleFromDB();
  await redis.set(cacheKey, isUserAdmin ? '1' : '0', { ex: 60 });
  return isUserAdmin;
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0] ?? '')
    .filter(part => part.length > 0)
    .join('; ');
}

describe('redis command budget', () => {
  const sessionStore = new Map<string, string>();
  const tally = emptyTally();
  let sessionCookies = '';
  let auth: ReturnType<typeof betterAuth>;

  function resetTally(): void {
    tally.get = 0;
    tally.set = 0;
    tally.del = 0;
    tally.evalsha = 0;
    tally.eval = 0;
  }

  beforeAll(async () => {
    auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'redis-budget-test-secret-32chars',
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      emailAndPassword: { enabled: true },
      telemetry: { enabled: false },
      rateLimit: { enabled: false },
      session: {
        expiresIn: 604800,
        updateAge: 86400,
        cookieCache: { enabled: true, maxAge: 300 },
        storeSessionInDatabase: true,
      },
      secondaryStorage: {
        async get(key) {
          tally.get += 1;
          return sessionStore.get(key) ?? null;
        },
        async set(key, value) {
          tally.set += 1;
          sessionStore.set(key, value);
        },
        async delete(key) {
          tally.del += 1;
          sessionStore.delete(key);
        },
      },
    });

    const signUp = await auth.api.signUpEmail({
      body: {
        email: 'redis-budget@example.com',
        password: 'password-long-enough',
        name: 'Redis Budget',
      },
      asResponse: true,
    });
    expect(signUp.ok).toBe(true);
    sessionCookies = cookieHeaderFrom(signUp);
    expect(sessionCookies).toContain('session_data');
    resetTally();
  });

  beforeEach(() => {
    resetTally();
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetBilling.mockResolvedValue({ success: true, data: null });
    mockGetSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: {
        id: 'ba-user-1',
        email: 'redis-budget@example.com',
        name: 'Redis Budget',
        image: null,
      },
    });
  });

  it('uses no secondary-storage commands when the session cookie is warm', async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookies }),
    });

    expect(session?.user.email).toBe('redis-budget@example.com');
    expect(tally).toEqual(emptyTally());
  });

  it('issues one GET when cookie cache is disabled', async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookies }),
      query: { disableCookieCache: true },
    });

    expect(session?.user.email).toBe('redis-budget@example.com');
    expect(tally).toEqual({ ...emptyTally(), get: 1 });
  });

  it('issues one GET when the request has no session_data cookie', async () => {
    const tokenOnly = sessionCookies
      .split('; ')
      .filter(part => !part.includes('session_data'))
      .join('; ');

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: tokenOnly }),
    });

    expect(session?.user.email).toBe('redis-budget@example.com');
    expect(tally).toEqual({ ...emptyTally(), get: 1 });
  });

  it('does not touch Redis from the proxy session-cookie check', () => {
    const request = new Request('https://jov.ie/app', {
      headers: { cookie: sessionCookies },
    });

    expect(getSessionCookie(request)).toEqual(expect.any(String));
    expect(tally).toEqual(emptyTally());
  });

  it('counts the removed admin Redis path and the current database path', async () => {
    const redis = {
      get: vi.fn(async (key: string) => {
        tally.get += 1;
        return key.endsWith('denial') ? '0' : key.endsWith('yes') ? '1' : null;
      }),
      set: vi.fn(async () => {
        tally.set += 1;
        return 'OK';
      }),
    };

    await tryRedisPathAt6c65244('admin:role:denial', redis, async () => false);
    expect(tally).toEqual({ ...emptyTally(), get: 1 });

    resetTally();
    await tryRedisPathAt6c65244('admin:role:miss', redis, async () => false);
    expect(tally).toEqual({ ...emptyTally(), get: 1, set: 1 });

    resetTally();
    await tryRedisPathAt6c65244('admin:role:yes', redis, async () => true);
    expect(tally).toEqual({ ...emptyTally(), get: 1, set: 1 });

    resetTally();
    mockGetRedis.mockReturnValue(redis);
    const { db } = await import('@/lib/db');
    vi.mocked(db.select).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            { isAdmin: true, userStatus: 'active', deletedAt: null },
          ],
        }),
      }),
    } as never);
    const { isAdmin } = await import('@/lib/admin/roles');

    await expect(isAdmin('app-user-1')).resolves.toBe(true);
    await expect(isAdmin('app-user-1')).resolves.toBe(true);
    expect(tally).toEqual(emptyTally());
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('writes one ban-status SET on the shell happy path', async () => {
    const redis = {
      get: vi.fn(async () => {
        tally.get += 1;
        return null;
      }),
      set: vi.fn(async () => {
        tally.set += 1;
        return 'OK';
      }),
    };
    mockGetRedis.mockReturnValue(redis);
    const { db } = await import('@/lib/db');
    vi.mocked(db.select).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ userStatus: 'active', deletedAt: null }],
        }),
      }),
    } as never);
    const { getUserBanStatus } = await import('@/lib/auth/ban-check');

    await expect(getUserBanStatus('app-user-1')).resolves.toEqual({
      isBanned: false,
    });
    await vi.waitFor(() => {
      expect(tally.set).toBe(1);
    });
    expect(tally.get).toBe(0);
  });

  it('counts one EVALSHA for the public artist limiter, two after NOSCRIPT', async () => {
    const steady = emptyTally();
    const steadyRedis = {
      evalsha: async () => {
        steady.evalsha += 1;
        return [1, 100];
      },
      eval: async () => {
        steady.eval += 1;
        return [1, 100];
      },
    };
    const steadyLimiter = new Ratelimit({
      redis: steadyRedis,
      limiter: Ratelimit.fixedWindow(100, '1 m'),
      analytics: false,
      prefix: 'public:artist-api',
    });

    const steadyResult = await steadyLimiter.limit('203.0.113.10');
    expect(steadyResult.success).toBe(true);
    expect(steadyResult.pending).toBeInstanceOf(Promise);
    await steadyResult.pending;
    expect(steady).toEqual({ ...emptyTally(), evalsha: 1 });

    const coldScript = emptyTally();
    const coldRedis = {
      evalsha: async () => {
        coldScript.evalsha += 1;
        throw new Error('NOSCRIPT No matching script. Please use EVAL.');
      },
      eval: async () => {
        coldScript.eval += 1;
        return [1, 100];
      },
    };
    const coldLimiter = new Ratelimit({
      redis: coldRedis,
      limiter: Ratelimit.fixedWindow(100, '1 m'),
      analytics: false,
      prefix: 'public:artist-api',
    });

    await coldLimiter.limit('203.0.113.10');
    expect(coldScript).toEqual({ ...emptyTally(), evalsha: 1, eval: 1 });
  });

  it('counts shell session reads for lightweight and full dashboard pages', async () => {
    vi.resetModules();
    mockGetBilling.mockResolvedValue({ success: true, data: null });
    const { getCachedAuth, getFreshAuth } = await import('@/lib/auth/cached');
    const { getCurrentUserEntitlements } = await import(
      '@/lib/entitlements/server'
    );

    expect(shouldUseEssentialShellData('/app')).toBe(true);
    expect(shouldUseEssentialShellData('/app/chat')).toBe(true);
    expect(shouldUseEssentialShellData('/app/library')).toBe(true);
    expect(shouldUseEssentialShellData('/app/ov/people')).toBe(true);
    expect(shouldUseEssentialShellData('/app/contacts')).toBe(false);
    expect(shouldUseEssentialShellData('/app/profiles')).toBe(false);

    await getCachedAuth();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession.mock.calls[0]?.[0]?.query).toBeUndefined();

    vi.resetModules();
    const fullAuth = await import('@/lib/auth/cached');
    const { getCurrentUserEntitlements: loadEntitlements } = await import(
      '@/lib/entitlements/server'
    );
    mockGetSession.mockClear();
    await fullAuth.getCachedAuth();
    await loadEntitlements();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    for (const call of mockGetSession.mock.calls) {
      expect(call[0]?.query).toBeUndefined();
    }

    vi.resetModules();
    const freshAuth = await import('@/lib/auth/cached');
    mockGetSession.mockClear();
    await freshAuth.getFreshAuth();
    await freshAuth.getCachedAuth();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession.mock.calls[0]?.[0]?.query).toEqual({
      disableCookieCache: true,
    });

    expect(getFreshAuth).toBeTypeOf('function');
    expect(getCurrentUserEntitlements).toBeTypeOf('function');
  });

  it('sums lightweight and full signed-in page commands', async () => {
    async function sessionReads(times: number, warm: boolean): Promise<void> {
      const cookie = warm
        ? sessionCookies
        : sessionCookies
            .split('; ')
            .filter(part => !part.includes('session_data'))
            .join('; ');
      for (let index = 0; index < times; index += 1) {
        await auth.api.getSession({
          headers: new Headers({ cookie }),
          ...(warm ? {} : {}),
        });
      }
    }

    async function beforeSessionReads(times: number): Promise<void> {
      for (let index = 0; index < times; index += 1) {
        await auth.api.getSession({
          headers: new Headers({ cookie: sessionCookies }),
          query: { disableCookieCache: true },
        });
      }
    }

    const banRedis = {
      set: async () => {
        tally.set += 1;
        return 'OK';
      },
      get: async () => {
        tally.get += 1;
        return null;
      },
    };
    mockGetRedis.mockReturnValue(banRedis);
    const { db } = await import('@/lib/db');
    vi.mocked(db.select).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              isAdmin: false,
              userStatus: 'active',
              deletedAt: null,
            },
          ],
        }),
      }),
    } as never);
    const { getUserBanStatus } = await import('@/lib/auth/ban-check');
    const { isAdmin } = await import('@/lib/admin/roles');

    async function banAndAdmin(adminCache: 'denial' | 'miss'): Promise<void> {
      await tryRedisPathAt6c65244(
        adminCache === 'denial' ? 'admin:role:denial' : 'admin:role:miss',
        {
          get: async (key: string) => {
            tally.get += 1;
            return key.endsWith('denial') ? '0' : null;
          },
          set: async () => {
            tally.set += 1;
            return 'OK';
          },
        },
        async () => false
      );
      const setsBeforeBan = tally.set;
      await getUserBanStatus(`ban-${adminCache}-${tally.get}`);
      await vi.waitFor(() => {
        expect(tally.set).toBe(setsBeforeBan + 1);
      });
    }

    resetTally();
    await beforeSessionReads(1);
    await banAndAdmin('denial');
    const lightweightBeforeDenial = totalCommands(tally);

    resetTally();
    await beforeSessionReads(1);
    await banAndAdmin('miss');
    const lightweightBeforeMiss = totalCommands(tally);

    resetTally();
    await sessionReads(1, true);
    await isAdmin('app-user-1');
    await getUserBanStatus('ban-after-light');
    await vi.waitFor(() => expect(tally.set).toBe(1));
    const lightweightAfterWarm = totalCommands(tally);

    resetTally();
    await sessionReads(1, false);
    await isAdmin('app-user-1');
    await getUserBanStatus('ban-after-light-cold');
    await vi.waitFor(() => expect(tally.set).toBe(1));
    const lightweightAfterCold = totalCommands(tally);

    resetTally();
    await beforeSessionReads(2);
    await banAndAdmin('denial');
    const fullBeforeDenial = totalCommands(tally);

    resetTally();
    await beforeSessionReads(2);
    await banAndAdmin('miss');
    const fullBeforeMiss = totalCommands(tally);

    resetTally();
    await sessionReads(2, true);
    await isAdmin('app-user-1');
    await isAdmin('app-user-1');
    await getUserBanStatus('ban-after-full');
    await vi.waitFor(() => expect(tally.set).toBe(1));
    const fullAfterWarm = totalCommands(tally);

    resetTally();
    await sessionReads(2, false);
    await isAdmin('app-user-1');
    await getUserBanStatus('ban-after-full-cold');
    await vi.waitFor(() => expect(tally.set).toBe(1));
    const fullAfterCold = totalCommands(tally);

    expect({
      lightweightBeforeDenial,
      lightweightBeforeMiss,
      lightweightAfterWarm,
      lightweightAfterCold,
      fullBeforeDenial,
      fullBeforeMiss,
      fullAfterWarm,
      fullAfterCold,
    }).toEqual({
      lightweightBeforeDenial: 3,
      lightweightBeforeMiss: 4,
      lightweightAfterWarm: 1,
      lightweightAfterCold: 2,
      fullBeforeDenial: 4,
      fullBeforeMiss: 5,
      fullAfterWarm: 1,
      fullAfterCold: 3,
    });
  });

  it('sums billing and admin mutation commands', async () => {
    async function freshSessionRead(): Promise<void> {
      await auth.api.getSession({
        headers: new Headers({ cookie: sessionCookies }),
        query: { disableCookieCache: true },
      });
    }

    async function legacyAdmin(cacheKey: string): Promise<void> {
      await tryRedisPathAt6c65244(
        cacheKey,
        {
          get: async (key: string) => {
            tally.get += 1;
            if (key.endsWith('denial')) return '0';
            if (key.endsWith('yes')) return '1';
            return null;
          },
          set: async () => {
            tally.set += 1;
            return 'OK';
          },
        },
        async () => cacheKey.endsWith('yes')
      );
    }

    resetTally();
    await freshSessionRead();
    const billing = totalCommands(tally);

    resetTally();
    await freshSessionRead();
    await legacyAdmin('admin:role:yes');
    const adminMutationBefore = totalCommands(tally);

    resetTally();
    await freshSessionRead();
    await legacyAdmin('admin:role:denial');
    const adminDenialBefore = totalCommands(tally);

    resetTally();
    await freshSessionRead();
    mockGetRedis.mockReturnValue({
      get: async () => {
        tally.get += 1;
        return null;
      },
      set: async () => {
        tally.set += 1;
        return 'OK';
      },
    });
    const { isAdmin } = await import('@/lib/admin/roles');
    await isAdmin('app-user-1');
    const adminMutationAfter = totalCommands(tally);

    expect({
      billing,
      adminMutationBefore,
      adminDenialBefore,
      adminMutationAfter,
    }).toEqual({
      billing: 1,
      adminMutationBefore: 3,
      adminDenialBefore: 2,
      adminMutationAfter: 1,
    });
  });
});

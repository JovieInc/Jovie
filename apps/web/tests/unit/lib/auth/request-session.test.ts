import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockHeaders,
  mockGetAppUserByBetterAuthId,
  mockGetCachedDevTestAuthSession,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockHeaders: vi.fn(),
  mockGetAppUserByBetterAuthId: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
}));

// Server action bodies run outside React's request cache, so `cache()` is a
// pass-through there. Model that here: any dedupe must come from the
// request-scoped session memo, not from React.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: mockGetAppUserByBetterAuthId,
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
  buildDevTestAuthCurrentUser: vi.fn(),
}));

vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));

const SESSION = {
  user: { id: 'ba_user_1', email: 'a@example.com', name: 'A', image: null },
  session: { id: 'sess_1' },
};

describe('getRequestSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue(SESSION);
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockGetAppUserByBetterAuthId.mockResolvedValue({
      id: 'user_1',
      userStatus: 'active',
      deletedAt: null,
    });
  });

  it('reads the session once per request for repeated cookie reads', async () => {
    const { getRequestSession } = await import('@/lib/auth/request-session');

    const results = await Promise.all([
      getRequestSession(),
      getRequestSession(),
      getRequestSession('cookie'),
    ]);
    await getRequestSession();

    expect(results.every(result => result === SESSION)).toBe(true);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession.mock.calls[0]?.[0]?.query).toBeUndefined();
  });

  it('lets a fresh read satisfy later cookie reads', async () => {
    const { getRequestSession } = await import('@/lib/auth/request-session');

    await getRequestSession('fresh');
    await getRequestSession('cookie');

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession.mock.calls[0]?.[0]?.query).toEqual({
      disableCookieCache: true,
    });
  });

  it('never lets a cookie read satisfy a fresh read', async () => {
    const { getRequestSession } = await import('@/lib/auth/request-session');

    await getRequestSession('cookie');
    await getRequestSession('fresh');
    await getRequestSession('fresh');

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockGetSession.mock.calls[1]?.[0]?.query).toEqual({
      disableCookieCache: true,
    });
  });

  it('does not share reads across requests', async () => {
    const { getRequestSession } = await import('@/lib/auth/request-session');

    mockHeaders.mockResolvedValueOnce(new Headers());
    await getRequestSession();
    mockHeaders.mockResolvedValueOnce(new Headers());
    await getRequestSession();

    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it('drops a rejected read so the next call retries', async () => {
    const { getRequestSession } = await import('@/lib/auth/request-session');

    mockGetSession.mockRejectedValueOnce(new Error('db timeout'));
    await expect(getRequestSession()).rejects.toThrow('db timeout');
    await expect(getRequestSession()).resolves.toBe(SESSION);

    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it('keeps a server action to one session read across auth helpers', async () => {
    const { getCachedAuth, getCachedCurrentUser, getOptionalAuth } =
      await import('@/lib/auth/cached');

    // The shape getCurrentUserEntitlements and dashboard actions produce.
    await getCachedAuth();
    await getCachedCurrentUser();
    await getCachedAuth({ session: 'cookie' });
    await getOptionalAuth();
    await getCachedCurrentUser({ session: 'cookie' });

    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockGetAppUserByBetterAuthId,
  mockCache,
  mockGetCachedDevTestAuthSession,
  mockBuildDevTestAuthCurrentUser,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetAppUserByBetterAuthId: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockBuildDevTestAuthCurrentUser: vi.fn(),
  mockHeaders: vi.fn(),
  mockCache: vi.fn(<T extends (...args: never[]) => unknown>(fn: T) => {
    let hasValue = false;
    let value: ReturnType<T>;
    return ((...args: never[]) => {
      if (!hasValue) {
        hasValue = true;
        value = fn(...args) as ReturnType<T>;
      }
      return value;
    }) as T;
  }),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: mockCache,
  };
});

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: mockGetAppUserByBetterAuthId,
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
  buildDevTestAuthCurrentUser: mockBuildDevTestAuthCurrentUser,
}));

vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));

describe('cached auth utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockBuildDevTestAuthCurrentUser.mockImplementation(session => ({
      id: session.clerkUserId,
      username: session.username,
      fullName: session.fullName,
      primaryEmailAddress: { emailAddress: session.email },
      emailAddresses: [{ emailAddress: session.email }],
      imageUrl: null,
      firstName: null,
      lastName: null,
    }));
  });

  describe('getCachedAuth', () => {
    it('returns the app user id from a Better Auth session', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'ba_user_1' },
        session: { id: 'sess_abc' },
      });
      mockGetAppUserByBetterAuthId.mockResolvedValue({ id: 'user_123' });

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const result = await getCachedAuth();

      expect(result).toEqual({
        userId: 'user_123',
        sessionId: 'sess_abc',
        orgId: null,
      });
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it('deduplicates multiple calls within the same request', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'ba_user_1' },
        session: { id: 'sess_dedupe' },
      });
      mockGetAppUserByBetterAuthId.mockResolvedValue({ id: 'user_dedupe' });

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const [result1, result2, result3] = await Promise.all([
        getCachedAuth(),
        getCachedAuth(),
        getCachedAuth(),
      ]);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it('uses the test-auth bypass session when present', async () => {
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        dbUserId: 'user_hdr',
        clerkUserId: 'ba_user_hdr',
        email: 'hdr@example.com',
        username: 'hdr',
        fullName: 'Hdr',
        isAdmin: false,
        persona: 'creator',
        profilePath: '/hdr',
      });

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const result = await getCachedAuth();

      expect(result.userId).toBe('user_hdr');
      expect(mockGetSession).not.toHaveBeenCalled();
    });
  });

  describe('getOptionalAuth', () => {
    it('returns null auth when outside a request scope', async () => {
      mockGetSession.mockRejectedValue(
        new Error('headers() expects to be called in a request scope')
      );

      const { getOptionalAuth } = await import('@/lib/auth/cached');
      await expect(getOptionalAuth()).resolves.toEqual({
        userId: null,
        sessionId: null,
        orgId: null,
      });
    });

    it('rethrows unrelated auth errors', async () => {
      mockGetSession.mockRejectedValue(new Error('redis unavailable'));

      const { getOptionalAuth } = await import('@/lib/auth/cached');
      await expect(getOptionalAuth()).rejects.toThrow('redis unavailable');
    });
  });

  describe('getCachedCurrentUser', () => {
    it('returns a synthetic user in test bypass mode', async () => {
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        dbUserId: 'db_1',
        clerkUserId: 'ba_1',
        email: 'creator@example.com',
        username: 'creator',
        fullName: 'Creator Example',
        isAdmin: false,
        persona: 'creator',
        profilePath: '/creator',
      });

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');
      const user = await getCachedCurrentUser();

      expect(user?.id).toBe('ba_1');
      expect(user?.primaryEmailAddress?.emailAddress).toBe(
        'creator@example.com'
      );
    });
  });
});

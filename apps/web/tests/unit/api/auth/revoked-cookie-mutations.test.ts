import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetAppUser = vi.hoisted(() => vi.fn());
const mockDevBypass = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());
const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockWithDbSessionTx = vi.hoisted(() => vi.fn());
const mockDeleteBlobs = vi.hoisted(() => vi.fn());
const mockCheckAccountDeleteRateLimit = vi.hoisted(() => vi.fn());
const mockWriteFlagOverride = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());
const mockGetUserBillingInfo = vi.hoisted(() => vi.fn());
const mockGetWaitlistAccess = vi.hoisted(() => vi.fn());
const mockApproveWaitlist = vi.hoisted(() => vi.fn());

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ cookie: 'better-auth.session_data=stale' }),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: mockGetAppUser,
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockDevBypass,
  buildDevTestAuthCurrentUser: vi.fn(),
}));

vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
  invalidateAdminCache: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
  captureCriticalError: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({ del: mockDeleteBlobs }));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAccountDeleteRateLimit: mockCheckAccountDeleteRateLimit,
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: vi.fn(),
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock('@/lib/flags/write-override.server', () => ({
  writeFlagOverride: mockWriteFlagOverride,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));
vi.mock('@/lib/auth/gate', () => ({
  getWaitlistAccess: mockGetWaitlistAccess,
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlist,
  finalizeWaitlistApproval: vi.fn(),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(),
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
}));

import { POST as deleteAccount } from '@/app/api/account/delete/route';
import { POST as rollbackFlag } from '@/app/api/admin/feature-flags/rollback/route';
import { POST as writeFlag } from '@/app/api/admin/feature-flags/route';
import { POST as unwaitlist } from '@/app/api/dev/unwaitlist/route';
import { getCachedAuth, getFreshAuth } from '@/lib/auth/cached';

const AUDIT_EVENT_ID = '0e9b2e6e-3f6f-4c1a-9f3c-2f7d0a1b2c3d';

function namedSession(id: string, email: string) {
  return {
    session: { id, token: id },
    user: { id, email, name: id, image: null },
  };
}

const COOKIE_SESSION = namedSession('ba_user_1', 'artist@example.com');

function sessionReadDisabledCookieCache(call: readonly unknown[]): boolean {
  const arg = call[0] as
    | { query?: { disableCookieCache?: boolean } }
    | undefined;
  return arg?.query?.disableCookieCache === true;
}

describe('revoked session with a still-valid cookie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDevBypass.mockResolvedValue(null);
    mockIsAdmin.mockResolvedValue(true);
    mockGetAppUser.mockResolvedValue({
      id: 'user_1',
      userStatus: 'active',
      deletedAt: null,
    });
    mockGetSession.mockImplementation(
      async (arg?: { query?: { disableCookieCache?: boolean } }) => {
        if (arg?.query?.disableCookieCache) return null;
        return COOKIE_SESSION;
      }
    );
    mockCheckAccountDeleteRateLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: new Date(Date.now() + 60_000),
    });
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: AUDIT_EVENT_ID,
              flagKey: 'SPOTIFY_OAUTH',
              envTier: 'prod',
              previousValue: false,
            },
          ],
        }),
      }),
    });
    mockWithDbSession.mockImplementation(async (fn: (id: string) => unknown) =>
      fn('user_1')
    );
    mockWithDbSessionTx.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn({})
    );
  });

  it('accepts the cookie and rejects the same session on a fresh read', async () => {
    await expect(getCachedAuth()).resolves.toMatchObject({ userId: 'user_1' });
    await expect(getFreshAuth()).resolves.toMatchObject({ userId: null });

    const calls = mockGetSession.mock.calls;
    expect(calls.some(call => !sessionReadDisabledCookieCache(call))).toBe(
      true
    );
    expect(calls.some(call => sessionReadDisabledCookieCache(call))).toBe(true);
  });

  it('denies account erasure before any delete side effect', async () => {
    const response = await deleteAccount(
      new Request('http://localhost/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockGetSession).toHaveBeenCalled();
    expect(
      mockGetSession.mock.calls.every(call =>
        sessionReadDisabledCookieCache(call)
      )
    ).toBe(true);
    expect(mockCheckAccountDeleteRateLimit).not.toHaveBeenCalled();
    expect(mockWithDbSession).not.toHaveBeenCalled();
    expect(mockWithDbSessionTx).not.toHaveBeenCalled();
    expect(mockDeleteBlobs).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it('denies a feature-flag write before the override is stored', async () => {
    const response = await writeFlag(
      new Request('http://localhost/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          flagKey: 'SPOTIFY_OAUTH',
          envTier: 'prod',
          enabled: true,
          reason: 'revoked-cookie regression',
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
    expect(
      mockGetSession.mock.calls.every(call =>
        sessionReadDisabledCookieCache(call)
      )
    ).toBe(true);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it('denies a feature-flag rollback before the audit row is read', async () => {
    const response = await rollbackFlag(
      new Request('http://localhost/api/admin/feature-flags/rollback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auditEventId: AUDIT_EVENT_ID,
          reason: 'revoked-cookie regression',
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(mockIsAdmin).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(
      mockGetSession.mock.calls.every(call =>
        sessionReadDisabledCookieCache(call)
      )
    ).toBe(true);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('loads the fresh email when a mutation cookie still names another user', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    mockGetAppUser.mockImplementation(async (baId: string) => ({
      id: baId === 'ba_fresh' ? 'user_fresh' : 'user_stale',
      userStatus: 'active',
      deletedAt: null,
    }));
    mockGetSession.mockImplementation(async (arg?: unknown) =>
      sessionReadDisabledCookieCache([arg])
        ? namedSession('ba_fresh', 'fresh@example.com')
        : namedSession('ba_stale', 'stale@example.com')
    );
    mockGetUserBillingInfo.mockResolvedValue({ success: true, data: null });
    mockGetWaitlistAccess.mockResolvedValue({ entryId: null });
    const response = await unwaitlist();
    expect(response.status).toBe(404);
    expect(mockGetWaitlistAccess).toHaveBeenCalledWith('fresh@example.com');
    expect(mockApproveWaitlist).not.toHaveBeenCalled();
    expect(
      mockGetSession.mock.calls.every(sessionReadDisabledCookieCache)
    ).toBe(true);
    vi.unstubAllEnvs();
  });

  it('rejects unwaitlist for a revoked cookie before waitlist approval', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    const response = await unwaitlist();
    expect(response.status).toBe(401);
    expect(mockGetWaitlistAccess).not.toHaveBeenCalled();
    expect(mockApproveWaitlist).not.toHaveBeenCalled();
    expect(mockGetUserBillingInfo).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

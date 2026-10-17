import crypto from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  cookies: new Map<string, string>(),
  headers: new Headers(),
  select: vi.fn(),
  audit: vi.fn(),
  execute: vi.fn(),
  limit: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookies.get(name);
      return value ? { value } : undefined;
    },
    set: mocks.setCookie,
    delete: mocks.deleteCookie,
  }),
}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: async () => null,
}));
vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  db: {
    select: mocks.select,
    insert: () => ({ values: mocks.audit }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ execute: mocks.execute }),
  },
}));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: async () => {},
}));
vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: async () => {},
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
  captureCriticalError: vi.fn(),
}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: async () => ({ success: false, error: 'User not found' }),
}));
vi.mock('@/lib/rate-limit', () => ({
  adminImpersonateLimiter: { limit: mocks.limit },
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '203.0.113.10',
  rateLimitDenialStatus: () => 429,
  rateLimitDenialMessage: (_result: unknown, message: string) => message,
}));

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'test-secret-for-impersonation';
const TTL = 15 * 60_000;
const COOKIE = 'jovie_impersonate';
let actor = {
  id: ACTOR,
  betterAuthUserId: 'ba-admin',
  email: 'admin@example.com',
  name: 'Administrator',
  isAdmin: true,
  userStatus: 'active',
  deletedAt: null as Date | null,
};
let target = {
  ...actor,
  id: TARGET,
  betterAuthUserId: 'ba-target',
  email: 'target@example.com',
  name: 'Target User',
  isAdmin: false,
};
let targetExists = true;

function nextRequest() {
  mocks.headers = new Headers();
}

function sign(payload: string) {
  return `${payload}:${crypto.createHmac('sha256', SECRET).update(payload).digest('hex')}`;
}

async function start(targetUserId = TARGET) {
  nextRequest();
  const { POST } = await import('@/app/api/admin/impersonate/route');
  return POST(
    new Request('http://localhost/api/admin/impersonate', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    })
  );
}

describe('Better Auth impersonation identity boundary', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('IMPERSONATION_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'test');
    actor = { ...actor, isAdmin: true, userStatus: 'active', deletedAt: null };
    target = {
      ...target,
      betterAuthUserId: 'ba-target',
      userStatus: 'active',
      deletedAt: null,
    };
    targetExists = true;
    mocks.cookies.clear();
    nextRequest();
    mocks.session.mockResolvedValue({
      user: {
        id: actor.betterAuthUserId,
        email: actor.email,
        name: actor.name,
      },
      session: { id: 'authenticated-admin-session' },
    });
    mocks.setCookie.mockImplementation((name: string, value: string) =>
      mocks.cookies.set(name, value)
    );
    mocks.deleteCookie.mockImplementation((name: string) =>
      mocks.cookies.delete(name)
    );
    mocks.audit.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue(undefined);
    mocks.limit.mockResolvedValue({
      success: true,
      reset: new Date(Date.now() + 60_000),
    });
    const dialect = new PgDialect();
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: SQL) => ({
          limit: async () => {
            const query = dialect.sqlToQuery(condition);
            expect(query.sql).not.toContain('clerk');
            const id = String(query.params[0]).toLowerCase();
            if (id === ACTOR || id === actor.betterAuthUserId) return [actor];
            if (
              targetExists &&
              (id === TARGET || id === target.betterAuthUserId)
            )
              return [target];
            return [];
          },
        }),
      }),
    }));
  });

  it('starts, inspects, uses and ends a UUID session while preserving the admin actor', async () => {
    const response = await start();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      actorUserId: ACTOR,
      effectiveUserId: TARGET,
    });
    expect(mocks.session).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } })
    );
    expect(mocks.setCookie).toHaveBeenCalledWith(
      COOKIE,
      expect.stringMatching(/^v2:/),
      expect.objectContaining({
        httpOnly: true,
        maxAge: 900,
        sameSite: 'lax',
        path: '/',
      })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ACTOR,
        targetUserId: TARGET,
        action: 'impersonation_started',
      })
    );

    nextRequest();
    const { GET, DELETE } = await import('@/app/api/admin/impersonate/route');
    const status = await GET();
    expect(await status.json()).toMatchObject({
      actorUserId: ACTOR,
      effectiveUserId: TARGET,
      isImpersonating: true,
    });
    expect(mocks.limit).toHaveBeenLastCalledWith(ACTOR);
    const { getCachedAuth, getCachedCurrentUser } = await import(
      '@/lib/auth/cached'
    );
    expect(await getCachedAuth()).toEqual({
      userId: TARGET,
      actorUserId: ACTOR,
      sessionId: 'authenticated-admin-session',
      orgId: null,
    });
    expect(await getCachedCurrentUser()).toMatchObject({
      id: target.betterAuthUserId,
      fullName: target.name,
      primaryEmailAddress: { emailAddress: target.email },
    });
    const { withDbSessionTx } = await import('@/lib/auth/session');
    expect(await withDbSessionTx(async (_tx, userId) => userId)).toBe(TARGET);
    const { getRlsTransactionSessionSetSql } = await import('@/lib/db');
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[0][0])).toEqual(
      dialect.sqlToQuery(getRlsTransactionSessionSetSql(TARGET))
    );
    const { isAdmin } = await import('@/lib/admin/roles');
    expect(await isAdmin(TARGET)).toBe(false);
    const { getCurrentUserEntitlements } = await import(
      '@/lib/entitlements/server'
    );
    expect(await getCurrentUserEntitlements()).toMatchObject({
      userId: TARGET,
      isAdmin: false,
    });
    const { requireCurrentAdminPageAccess } = await import(
      '@/lib/admin/page-access'
    );
    expect(await requireCurrentAdminPageAccess()).toBe(ACTOR);
    const { requireAdmin } = await import('@/lib/admin/middleware');
    expect(await requireAdmin({ session: 'fresh' })).toBeNull();

    nextRequest();
    expect((await DELETE()).status).toBe(200);
    expect(mocks.cookies.has(COOKIE)).toBe(false);
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        adminUserId: ACTOR,
        targetUserId: TARGET,
        action: 'impersonation_ended',
      })
    );
    nextRequest();
    expect(await getCachedAuth()).toMatchObject({ userId: ACTOR });
    expect((await getCachedAuth()).actorUserId).toBeUndefined();
  });

  it.each([
    'missing',
    'self',
    'self-case',
    'inactive',
    'deleted',
    'banned',
    'suspended',
    'unlinked',
  ] as const)(
    'rejects a %s target before setting a cookie or audit',
    async kind => {
      if (kind === 'missing') targetExists = false;
      if (kind === 'inactive') target.userStatus = 'onboarding_incomplete';
      if (kind === 'deleted') target.deletedAt = new Date();
      if (kind === 'banned' || kind === 'suspended') target.userStatus = kind;
      if (kind === 'unlinked') target.betterAuthUserId = '';
      expect(
        (
          await start(
            kind === 'self'
              ? ACTOR
              : kind === 'self-case'
                ? ACTOR.toUpperCase()
                : TARGET
          )
        ).status
      ).toBe(400);
      expect(mocks.setCookie).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );

  it('denies a target session attempting to start impersonation', async () => {
    mocks.session.mockResolvedValue({
      user: { id: 'ba-target' },
      session: { id: 'target-session' },
    });
    expect((await start(OTHER)).status).toBe(403);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it('does not activate impersonation when the audit write fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await start()).status).toBe(500);
    expect(mocks.cookies.has(COOKIE)).toBe(false);
  });

  it('sets a secure cookie when production explicitly enables impersonation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('ENABLE_IMPERSONATION', 'true');
    expect((await start()).status).toBe(200);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      COOKIE,
      expect.any(String),
      expect.objectContaining({ secure: true, httpOnly: true, maxAge: 900 })
    );
  });

  it('clears an orphaned token when current-user resolution has no actor session', async () => {
    expect((await start()).status).toBe(200);
    mocks.session.mockResolvedValue(null);
    nextRequest();
    const { getCachedCurrentUser } = await import('@/lib/auth/cached');
    expect(await getCachedCurrentUser()).toBeNull();
    expect(mocks.cookies.has(COOKIE)).toBe(false);
  });

  it('clears access even when the ending audit write fails', async () => {
    expect((await start()).status).toBe(200);
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    nextRequest();
    const { DELETE } = await import('@/app/api/admin/impersonate/route');
    expect((await DELETE()).status).toBe(500);
    expect(mocks.cookies.has(COOKIE)).toBe(false);
  });

  it.each([
    'forged',
    'expired',
    'future',
    'legacy',
    'legacy-uuid',
    'mismatched',
    'signed-non-uuid',
    'overlong',
    'timestamp-junk',
    'signature-junk',
    'revoked',
    'deleted-actor',
    'banned-target',
    'inactive-target',
    'target-session',
    'deleted-target',
    'missing-target',
    'disabled',
    'missing-session',
  ] as const)('rejects and clears a %s token', async kind => {
    expect((await start()).status).toBe(200);
    const now = Date.now();
    if (kind === 'forged') {
      const token = mocks.cookies.get(COOKIE) ?? '';
      mocks.cookies.set(
        COOKIE,
        token.slice(0, -1) + (token.endsWith('f') ? 'e' : 'f')
      );
    }
    if (kind === 'expired')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${ACTOR}:${TARGET}:${now - TTL}:${now}`)
      );
    if (kind === 'future')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${ACTOR}:${TARGET}:${now + 60_000}:${now + TTL}`)
      );
    if (kind === 'legacy')
      mocks.cookies.set(
        COOKIE,
        sign(`user_admin:user_target:${now}:${now + TTL}`)
      );
    if (kind === 'legacy-uuid')
      mocks.cookies.set(COOKIE, sign(`${ACTOR}:${TARGET}:${now}:${now + TTL}`));
    if (kind === 'mismatched')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${OTHER}:${TARGET}:${now}:${now + TTL}`)
      );
    if (kind === 'signed-non-uuid')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${ACTOR}:user_target:${now}:${now + TTL}`)
      );
    if (kind === 'overlong')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${ACTOR}:${TARGET}:${now}:${now + TTL + 1}`)
      );
    if (kind === 'timestamp-junk')
      mocks.cookies.set(
        COOKIE,
        sign(`v2:${ACTOR}:${TARGET}:${now}junk:${now + TTL}`)
      );
    if (kind === 'signature-junk')
      mocks.cookies.set(COOKIE, `${mocks.cookies.get(COOKIE)}junk`);
    if (kind === 'revoked') actor.isAdmin = false;
    if (kind === 'deleted-actor') actor.deletedAt = new Date();
    if (kind === 'banned-target') target.userStatus = 'banned';
    if (kind === 'inactive-target') target.userStatus = 'onboarding_incomplete';
    if (kind === 'target-session')
      mocks.session.mockResolvedValue({
        user: { id: 'ba-target' },
        session: { id: 'target-session' },
      });
    if (kind === 'deleted-target') target.deletedAt = new Date();
    if (kind === 'missing-target') targetExists = false;
    if (kind === 'disabled') {
      vi.stubEnv('IMPERSONATION_SECRET', '');
      vi.stubEnv('URL_ENCRYPTION_KEY', '');
    }
    if (kind === 'missing-session') mocks.session.mockResolvedValue(null);
    nextRequest();
    const { getFreshAuth } = await import('@/lib/auth/cached');
    const result = await getFreshAuth();
    expect(result.userId).toBe(
      kind === 'missing-session' || kind === 'deleted-actor'
        ? null
        : kind === 'target-session'
          ? TARGET
          : ACTOR
    );
    expect(result.actorUserId).toBeUndefined();
    expect(mocks.cookies.has(COOKIE)).toBe(false);
  });
});

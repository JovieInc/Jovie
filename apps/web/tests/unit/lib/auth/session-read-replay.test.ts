import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  applyRlsSessionUser: vi.fn(),
  applyRlsTransactionUser: vi.fn(),
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
  getRlsTransactionSessionSetSql: vi.fn(),
  resetRlsSession: vi.fn(),
}));

vi.mock('@/lib/db/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>();
  return {
    ...actual,
    logDbError: vi.fn(),
    logDbInfo: vi.fn(),
  };
});

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: null })),
}));

vi.mock('@/lib/claim/claim-verification', () => ({
  isProofBlockingPublication: vi.fn(() => false),
}));

vi.mock('@/lib/db/legacy-transaction', () => ({
  runLegacyDbTransaction: vi.fn(),
}));

import { getDbUser, getSessionContext } from '@/lib/auth/session';

const TRANSPORT_KILL =
  'terminating connection due to unexpected postmaster exit';

const USER_ROW = {
  clerkId: null,
  email: null,
  id: 'u1',
  isAdmin: false,
  isPro: null,
  userStatus: 'active' as const,
};

const SESSION_ROW = {
  profileId: null,
  profileIsPublic: null,
  profileOnboardingCompletedAt: null,
  profileSettings: null,
  userClerkId: 'user_abc',
  userEmail: null,
  userId: '11111111-1111-4111-8111-111111111111',
  userIsAdmin: false,
  userIsPro: null,
  userStatus: 'active' as const,
};

/**
 * Drizzle-shaped chainable select builder:
 * .select().from().innerJoin()/leftJoin().where().limit() -> rows promise.
 */
function selectChain(rows: Promise<unknown[]>): unknown {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    limit: () => rows,
    where: () => chain,
  };
  return chain;
}

/** Queue a per-attempt select implementation; returns an attempts getter. */
function queueSelect(impl: (attempt: number) => Promise<unknown[]>) {
  let attempt = 0;
  selectMock.mockImplementation(() => {
    attempt += 1;
    return selectChain(impl(attempt));
  });
  return () => attempt;
}

describe('session read replay (JOV-13156)', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('replays a transport-killed getDbUser read once', async () => {
    const attempts = queueSelect(attempt => {
      if (attempt === 1) {
        return Promise.reject(new Error(TRANSPORT_KILL));
      }
      return Promise.resolve([{ ...USER_ROW }]);
    });

    const user = await getDbUser('user_abc');

    expect(user?.id).toBe('u1');
    expect(attempts()).toBe(2);
  });

  it('replays a transport-killed getSessionContext read once', async () => {
    const attempts = queueSelect(attempt => {
      if (attempt === 1) {
        return Promise.reject(new Error(TRANSPORT_KILL));
      }
      return Promise.resolve([{ ...SESSION_ROW }]);
    });

    const context = await getSessionContext({ clerkUserId: 'user_abc' });

    expect(context.user.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(attempts()).toBe(2);
  });

  it('fails after one attempt on non-transport errors', async () => {
    const attempts = queueSelect(() =>
      Promise.reject(new Error('relation "users" does not exist'))
    );

    await expect(getDbUser('user_abc')).rejects.toThrow(
      'relation "users" does not exist'
    );
    expect(attempts()).toBe(1);
  });

  it('returns null for a missing user without erroring', async () => {
    const attempts = queueSelect(() => Promise.resolve([]));

    const user = await getDbUser('user_abc');

    expect(user).toBeNull();
    expect(attempts()).toBe(1);
  });
});

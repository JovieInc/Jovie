import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared workers may have evaluated these modules with another file's mocks.
vi.hoisted(() => vi.resetModules());
// Do not leave this file's mocked dependency graph cached for the next file.
afterAll(() => vi.resetModules());

import { getDashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';

/**
 * Shared transaction-isolation harness, verbatim from
 * dashboard-data-tx-isolation.test.ts (which is pinned by the Company
 * Guards size-500 per-file baseline and may not grow). See that file for
 * the full JOV-4189/JOV-4241 explanation of the 25P02 cascade these
 * mocks simulate.
 */

type QueryOutcome = () => { rows?: unknown[]; error?: unknown };

type TxState = { poisoned: boolean; closed: boolean; rolledBack: boolean };

const {
  captureExceptionMock,
  cleanupGates,
  commitFailures,
  loggerErrorMock,
  loggerWarnMock,
  outcomes,
  setupFailures,
  txStates,
  withDbSessionTxMock,
} = vi.hoisted(() => {
  const cleanupGates = new Map<number, () => Promise<void>>();
  const commitFailures = new Map<number, QueryOutcome>();
  const outcomes: QueryOutcome[] = [];
  const setupFailures = new Map<number, QueryOutcome>();
  const txStates: TxState[] = [];

  function createAbortedTxError(): Error & { code?: string } {
    const error = new Error(
      "Failed query: SELECT set_config('statement_timeout', $1, false)\n" +
        'cause: current transaction is aborted, commands ignored until end of transaction block'
    ) as Error & { code?: string };
    error.code = '25P02';
    return error;
  }

  function createTx(state: TxState) {
    const tx = {
      __isPoisoned: () => state.poisoned,
      execute: vi.fn(async () => {
        if (state.poisoned) throw createAbortedTxError();
        return { rows: [] };
      }),
      select: vi.fn(() => {
        // Annotated so the fallback widens to QueryOutcome; the un-annotated
        // form infers a narrower { rows: never[] } union member that makes
        // result.error a TS2339 (the pinned original baselines that error).
        const outcome: QueryOutcome =
          outcomes.shift() ?? (() => ({ rows: [] }));
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.from = chain;
        builder.where = chain;
        builder.limit = chain;
        builder.orderBy = chain;
        // Thenable: drizzle query builders are awaited directly. Once the
        // transaction is poisoned, every later statement rejects with a
        // 25P02-style error — that is the real Postgres behavior.
        builder.then = (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          let settled: Promise<unknown>;
          if (state.poisoned) {
            settled = Promise.reject(createAbortedTxError());
          } else {
            try {
              const result = outcome();
              if (result.error) {
                state.poisoned = true;
                settled = Promise.reject(result.error);
              } else {
                settled = Promise.resolve(result.rows ?? []);
              }
            } catch (error) {
              state.poisoned = true;
              settled = Promise.reject(error);
            }
          }
          return settled.then(onFulfilled, onRejected);
        };
        return builder;
      }),
    };
    return tx;
  }

  const withDbSessionTxMock = vi.fn(
    async (handler: (tx: unknown, userId: string) => Promise<unknown>) => {
      const state: TxState = {
        poisoned: false,
        closed: false,
        rolledBack: false,
      };
      const transactionIndex = txStates.length;
      txStates.push(state);
      try {
        const setupError = setupFailures.get(transactionIndex)?.().error;
        if (setupError) {
          state.poisoned = true;
          throw setupError;
        }
        const result = await handler(createTx(state), 'user_123');
        const commitError = commitFailures.get(transactionIndex)?.().error;
        if (commitError) {
          // The callback already finished; Drizzle's post-callback COMMIT
          // failed on the wire and the wrapper discarded the client (JOV-8641
          // preserves this original error instead of letting ROLLBACK mask
          // it). Nothing the callback wrote can be acknowledged.
          throw commitError;
        }
        return result;
      } catch (error) {
        state.rolledBack = true;
        throw error;
      } finally {
        const cleanup = cleanupGates.get(transactionIndex);
        if (cleanup) await cleanup();
        state.closed = true;
      }
    }
  );

  return {
    captureExceptionMock: vi.fn(),
    cleanupGates,
    commitFailures,
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    outcomes,
    setupFailures,
    txStates,
    withDbSessionTxMock,
  };
});

const ok =
  (rows: unknown[]): QueryOutcome =>
  () => ({ rows });
const fail =
  (error: unknown): QueryOutcome =>
  () => ({ error });

const dashboardProfile = {
  id: 'profile_1',
  userId: 'user_db_1',
  username: 'tim',
  usernameNormalized: 'tim',
  displayName: 'Tim White',
  avatarUrl: 'https://example.com/avatar.jpg',
  isPublic: true,
  onboardingCompletedAt: new Date('2026-07-20T00:00:00.000Z'),
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  updatedAt: new Date('2026-07-20T00:00:00.000Z'),
};

const userRow = {
  id: 'user_db_1',
  email: 'user@example.com',
  activeProfileId: 'profile_1',
};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock('@sentry/nextjs', () => {
  return {
    getClient: vi.fn(() => undefined),
    captureException: captureExceptionMock,
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    logger: {
      error: loggerErrorMock,
      warn: loggerWarnMock,
    },
    startSpan: vi.fn(
      async (_options: unknown, callback: () => Promise<unknown>) => callback()
    ),
  };
});

vi.mock('next/cache', async () => {
  const actual =
    await vi.importActual<typeof import('next/cache')>('next/cache');
  return {
    ...actual,
    // Identity: every call re-runs the fetch so tests are deterministic.
    unstable_cache: vi.fn(
      <T extends (...args: never[]) => unknown>(fn: T) => fn
    ),
    unstable_noStore: vi.fn(),
    revalidateTag: vi.fn(),
    updateTag: vi.fn(),
  };
});

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: vi.fn(async () => false),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: 'user_123' })),
  getOptionalAuth: vi.fn(async () => ({ userId: 'user_123' })),
  getCachedSessionTokenAuth: vi.fn(async () => ({ userId: 'user_123' })),
  getCachedCurrentUser: vi.fn(),
}));

vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: withDbSessionTxMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(async () => ({
    userId: 'user_123',
    email: 'user@example.com',
    isAuthenticated: true,
    isAdmin: false,
    isPro: false,
    hasAdvancedFeatures: false,
    canRemoveBranding: false,
  })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
  },
  doesTableExist: vi.fn(async () => false),
}));

vi.mock('@/lib/db/query-timeout', () => ({
  QUERY_TIMEOUTS: { dashboard: 8000, api: 5000, default: 5000 },
  setStatementTimeout: vi.fn(async () => {}),
  // Mirrors the real wrapper: statement_timeout is applied on the target
  // client before the query — on a poisoned transaction that set_config is
  // the statement that fails, which is exactly the production fingerprint.
  dashboardQuery: vi.fn(
    async (
      fn: () => Promise<unknown>,
      _context?: string,
      options?: { db?: { __isPoisoned?: () => boolean } }
    ) => {
      if (options?.db?.__isPoisoned?.()) {
        const error = new Error(
          "Failed query: SELECT set_config('statement_timeout', $1, false)\n" +
            'cause: current transaction is aborted, commands ignored until end of transaction block'
        ) as Error & { code?: string };
        error.code = '25P02';
        throw error;
      }
      return fn();
    }
  ),
  isQueryTimeoutError: (error: unknown) =>
    error instanceof Error && error.name === 'QueryTimeoutError',
  // Mirrors the real helper, which recurses into error.cause — Drizzle wraps
  // PG errors so the timeout text lives on the cause, not the outer message.
  isPostgresTimeoutError: function isPostgresTimeoutErrorMock(
    error: unknown
  ): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes('canceling statement due to statement timeout') ||
      error.message.includes('idle-in-transaction timeout') ||
      (error.cause instanceof Error && isPostgresTimeoutErrorMock(error.cause))
    );
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  clickEvents: {
    creatorProfileId: 'creatorProfileId',
    linkType: 'linkType',
    metadata: 'metadata',
    createdAt: 'createdAt',
  },
  tips: {
    creatorProfileId: 'creatorProfileId',
    amountCents: 'amountCents',
    id: 'id',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  userSettings: { userId: 'userId', sidebarCollapsed: 'sidebarCollapsed' },
  users: {
    id: 'id',
    clerkId: 'clerkId',
    email: 'email',
    activeProfileId: 'activeProfileId',
  },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    creatorProfileId: 'creatorProfileId',
    isActive: 'isActive',
    state: 'state',
    platformType: 'platformType',
    platform: 'platform',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorDistributionEvents: {
    createdAt: 'createdAt',
    creatorProfileId: 'creatorProfileId',
    eventType: 'eventType',
    platform: 'platform',
  },
  creatorProfiles: { userId: 'userId', id: 'id', createdAt: 'createdAt' },
  profilePhotos: {
    width: 'width',
    height: 'height',
    creatorProfileId: 'creatorProfileId',
    photoType: 'photoType',
    status: 'status',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/db/server', () => ({
  createEmptyTippingStats: vi.fn(() => ({
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  })),
  profileIsPublishable: vi.fn(() => true),
  selectDashboardProfile: vi.fn(profiles => profiles[0] ?? null),
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlAny: vi.fn(() => 'mock-sql'),
}));

vi.mock('@/lib/services/social-links/types', () => ({
  DSP_PLATFORMS: ['spotify', 'apple-music'],
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(async () => {}),
  captureError: vi.fn(async () => {}),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function capturedErrors(): unknown[] {
  return captureExceptionMock.mock.calls.map(call => call[0]);
}

function capturedCascadeErrors(): unknown[] {
  return capturedErrors().filter(
    error =>
      error instanceof Error &&
      /25P02|current transaction is aborted|set_config\('statement_timeout'/.test(
        error.message
      )
  );
}

function queueReadsBeforeDistribution(): void {
  outcomes.push(
    ok([userRow]),
    ok([dashboardProfile]),
    ok([{ sidebarCollapsed: false }]),
    ok([{ count: 0 }]),
    ok([{ count: 0 }]),
    ok([{ hasLinks: true, hasMusicLinks: true }]),
    ok([{ width: 1024, height: 1024 }]),
    ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
    ok([{ total: 3, qr: 1, link: 2 }])
  );
}

// ---- JOV-12096 regression tests ----

describe('avatar commit-wrapped transport recovery (JOV-12096)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    vi.mocked(setStatementTimeout).mockReset().mockResolvedValue(undefined);
    const { doesTableExist } = await import('@/lib/db');
    vi.mocked(doesTableExist).mockReset().mockResolvedValue(false);
    cleanupGates.clear();
    commitFailures.clear();
    outcomes.length = 0;
    setupFailures.clear();
    txStates.length = 0;
  });

  it('recovers a commit-wrapped transport failure whose cause text matches no retryable pattern', async () => {
    // The Nov 9 2026 regression: the commit cause chain carried none of the
    // transport vocabulary (e.g. undici `fetch failed`), so the cause-text
    // predicate declined to replay a read whose callback had already
    // succeeded and paged Sentry for a degradation that had already returned
    // UNKNOWN. For this side-effect-free read the `Failed query: commit`
    // wrapper shape alone is the replay-safety proof (JOV-8837 contract).
    const commitFetchFailed = () =>
      new Error('Failed query: commit', { cause: new Error('fetch failed') });
    commitFailures.set(2, fail(commitFetchFailed()));
    queueReadsBeforeDistribution();
    // Both avatar attempts consume one profilePhotos outcome each: the first
    // attempt's rows are discarded by its failed commit, so the retry needs
    // its own queued read inserted after the first avatar outcome.
    outcomes.splice(7, 0, () => {
      // Recovery starts only after the failed transaction fully closed and
      // was discarded — never on the poisoned, still-open connection.
      expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
      return { rows: [{ width: 2048, height: 2048 }] };
    });

    const result = await getDashboardData();

    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 2048,
      height: 2048,
    });
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
    expect(txStates[3]).toMatchObject({ closed: true, rolledBack: false });
    expect(txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(capturedCascadeErrors()).toEqual([]);
  });

  it('degrades a twice-failed commit-wrapped transport failure log-only', async () => {
    const commitFetchFailed = () =>
      new Error('Failed query: commit', { cause: new Error('fetch failed') });
    const firstCommit = commitFetchFailed();
    const secondCommit = commitFetchFailed();
    commitFailures.set(2, fail(firstCommit));
    commitFailures.set(3, fail(secondCommit));
    loggerWarnMock.mockImplementation((message: string) => {
      if (message.includes('[avatar-quality]')) {
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
        expect(txStates[3]).toMatchObject({ closed: true, rolledBack: true });
        expect(message).toContain('transient DB condition');
      }
    });
    queueReadsBeforeDistribution();
    // Both avatar attempts consume one profilePhotos outcome each before
    // their commits die; the retry needs its own queued read.
    outcomes.splice(7, 0, ok([{ width: 1024, height: 1024 }]));

    const result = await getDashboardData();

    expect(result.avatarQuality?.status).toBe('unknown');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[avatar-quality] transient DB condition after retry; degrading to unknown quality',
      expect.objectContaining({
        profileId: 'profile_1',
        error: expect.stringContaining('fetch failed'),
      })
    );
    expect(capturedCascadeErrors()).toEqual([]);
    expect(txStates.every(state => state.closed)).toBe(true);
  });
});

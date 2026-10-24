import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';

/**
 * Regression tests for the statement_timeout 25P02 cascade (JOV-4189,
 * JOV-4190, JOV-4241, JOV-4242).
 *
 * The dashboard full fetch runs supplementary reads that tolerate failure
 * (social-links existence, avatar quality, tipping stats, bio-link
 * activation). In Postgres, any statement error aborts the surrounding
 * transaction (25P02 "current transaction is aborted"). When those reads
 * shared one transaction and swallowed their errors, the NEXT statement on
 * the poisoned transaction — typically set_config('statement_timeout', ...)
 * inside dashboardQuery — failed and Drizzle named THAT query in the error,
 * hiding the real first error.
 *
 * These tests simulate Postgres transaction poisoning: once a query on a
 * transaction rejects, every later statement on that same transaction
 * rejects with a 25P02-style error. Each withDbSessionTx call gets a fresh
 * transaction state, so per-read isolation is directly observable.
 */

type QueryOutcome = () => { rows?: unknown[]; error?: unknown };

type TxState = { poisoned: boolean; closed: boolean; rolledBack: boolean };

const {
  captureExceptionMock,
  cleanupGates,
  loggerErrorMock,
  loggerWarnMock,
  outcomes,
  setupFailures,
  txStates,
  withDbSessionTxMock,
} = vi.hoisted(() => {
  const cleanupGates = new Map<number, () => Promise<void>>();
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
        const outcome = outcomes.shift() ?? (() => ({ rows: [] }));
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
        return await handler(createTx(state), 'user_123');
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

function idleDistributionError(code?: string): Error {
  const cause = new Error(
    'terminating connection due to idle-in-transaction timeout'
  );
  if (code) Object.assign(cause, { code });
  return new Error(
    "Failed query: SELECT set_config('statement_timeout', $1, true)",
    { cause }
  );
}

describe('dashboard data transaction isolation (JOV-4189)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    vi.mocked(setStatementTimeout).mockReset().mockResolvedValue(undefined);
    const { doesTableExist } = await import('@/lib/db');
    vi.mocked(doesTableExist).mockReset().mockResolvedValue(false);
    cleanupGates.clear();
    outcomes.length = 0;
    setupFailures.clear();
    txStates.length = 0;
  });

  it('confines a failing supplementary read to its own transaction — no 25P02 cascade', async () => {
    const realLinksError = new Error('boom: social_links read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // settled Inbox suggested-actions count
      ok([{ count: 0 }]), // settled Inbox tour-dates count
      fail(realLinksError), // social links existence read fails
      ok([{ width: 1024, height: 1024 }]), // avatar quality read
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const result = await getDashboardData();

    // Fallback semantics for the failed read are preserved.
    expect(result.hasSocialLinks).toBe(false);
    expect(result.hasMusicLinks).toBe(false);

    // Sibling reads still ran — the poisoned transaction did not take them down.
    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 1024,
      height: 1024,
    });
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.tippingStats.tipClicks).toBe(3);

    // The real first error is what reached Sentry...
    expect(captureExceptionMock).toHaveBeenCalledWith(
      realLinksError,
      expect.objectContaining({
        tags: expect.objectContaining({ query: 'social_links_existence' }),
      })
    );
    // ...and no statement_timeout 25P02 cascade was reported anywhere.
    expect(capturedCascadeErrors()).toEqual([]);

    // Isolation mechanism: 1 base transaction + 3 supplementary reads; absent distribution table opens none.
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it.each(['25P03', undefined])(
    'JOV-8834: recovers an idle social-link read (%s) after cleanup with the same identity',
    async code => {
      const idle = new Error('Failed query: select', {
        cause: Object.assign(
          new Error(
            'terminating connection due to idle-in-transaction timeout'
          ),
          code ? { code } : {}
        ),
      });
      let releaseCleanup!: () => void;
      let signalCleanup!: () => void;
      const cleanupStarted = new Promise<void>(resolve => {
        signalCleanup = resolve;
      });
      const pendingCleanup = new Promise<void>(resolve => {
        releaseCleanup = resolve;
      });
      cleanupGates.set(1, () => {
        signalCleanup();
        return pendingCleanup;
      });
      queueReadsBeforeDistribution();
      outcomes.splice(5, 0, fail(idle));

      const resultPromise = getDashboardData();
      await cleanupStarted;
      try {
        expect(txStates).toHaveLength(2);
        expect(captureExceptionMock).not.toHaveBeenCalled();
      } finally {
        releaseCleanup();
        await resultPromise;
      }
      const result = await resultPromise;
      expect(result.hasSocialLinks).toBe(true);
      expect(result.hasMusicLinks).toBe(true);
      expect(result.tippingStats.totalReceivedCents).toBe(100);
      expect(result.dashboardLoadError).toBeUndefined();
      expect(txStates[1]).toMatchObject({ closed: true, rolledBack: true });
      expect(txStates.every(state => state.closed)).toBe(true);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
      expect(withDbSessionTxMock).toHaveBeenNthCalledWith(
        3,
        expect.any(Function),
        { clerkUserId: 'user_123' }
      );
      expect(captureExceptionMock).not.toHaveBeenCalled();
    }
  );

  it('JOV-8834: retries an idle RLS setup failure before the social-link callback', async () => {
    setupFailures.set(1, fail(idleDistributionError('25P03')));
    queueReadsBeforeDistribution();
    const result = await getDashboardData();
    expect(result.hasSocialLinks).toBe(true);
    expect(result.hasMusicLinks).toBe(true);
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(txStates[1]).toMatchObject({ closed: true, rolledBack: true });
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('JOV-8834: falls back after two idle social-link failures have rolled back', async () => {
    const first = idleDistributionError('25P03');
    const second = idleDistributionError('25P03');
    queueReadsBeforeDistribution();
    outcomes.splice(5, 1, fail(first), fail(second));
    captureExceptionMock.mockImplementation(error => {
      if (error === second) {
        expect(txStates[1]).toMatchObject({ closed: true, rolledBack: true });
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
      }
    });
    const result = await getDashboardData();
    expect(result.hasSocialLinks).toBe(false);
    expect(result.hasMusicLinks).toBe(false);
    expect(result.avatarQuality?.status).toBe('ok');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(capturedErrors()).toEqual([second]);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      second,
      expect.objectContaining({
        tags: {
          query: 'social_links_existence',
          context: 'dashboard_data_settled',
        },
      })
    );
  });

  it.each(['57014', '25P02', '42501', '40001', '08006'])(
    'JOV-8834: reports SQLSTATE %s after cleanup without replaying the social-link read',
    async code => {
      const error = idleDistributionError(code);
      queueReadsBeforeDistribution();
      outcomes.splice(5, 1, fail(error));
      captureExceptionMock.mockImplementation(captured => {
        if (captured === error) {
          expect(txStates[1]).toMatchObject({ closed: true, rolledBack: true });
        }
      });
      const result = await getDashboardData();
      expect(result.hasSocialLinks).toBe(false);
      expect(result.tippingStats.totalReceivedCents).toBe(100);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
      expect(capturedErrors()).toEqual([error]);
    }
  );

  it('JOV-8834: declines social-link recovery once its retry admission budget expires', async () => {
    const clock = vi.spyOn(performance, 'now');
    queueReadsBeforeDistribution();
    outcomes.splice(5, 1, () => {
      clock.mockReturnValue(Number.MAX_SAFE_INTEGER);
      return { error: idleDistributionError('25P03') };
    });
    try {
      const result = await getDashboardData();
      expect(result.hasSocialLinks).toBe(false);
      expect(result.tippingStats.totalReceivedCents).toBe(100);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    } finally {
      clock.mockRestore();
    }
  });

  it('JOV-8834: awaits asynchronous SQL timeout setup before querying or returning fallback', async () => {
    const timeout = Object.assign(
      new Error('canceling statement due to statement timeout'),
      { code: '57014' }
    );
    let rejectSetup!: (error: Error) => void;
    let signalSetup!: () => void;
    const setupStarted = new Promise<void>(resolve => {
      signalSetup = resolve;
    });
    const pendingSetup = new Promise<void>((_resolve, reject) => {
      rejectSetup = reject;
    });
    void pendingSetup.catch(() => {});
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    vi.mocked(setStatementTimeout).mockImplementationOnce(() => {
      signalSetup();
      return pendingSetup;
    });
    queueReadsBeforeDistribution();
    outcomes.splice(5, 1);
    const resultPromise = getDashboardData();
    await setupStarted;
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(outcomes).toHaveLength(3);
      expect(txStates).toHaveLength(2);
      expect(txStates[1].closed).toBe(false);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    } finally {
      rejectSetup(timeout);
      await resultPromise;
    }
    const result = await resultPromise;
    expect(result.hasSocialLinks).toBe(false);
    expect(result.avatarQuality?.status).toBe('ok');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(txStates[1]).toMatchObject({ closed: true, rolledBack: true });
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    expect(capturedErrors()).toEqual([timeout]);
  });

  it('degrades the Inbox count read log-only on connector schema drift (JOV-5160)', async () => {
    // Prod fingerprint of Sentry issue 7673925206: the suggested_actions
    // pending-count read throws when prod predates migration 0048. Drizzle
    // wraps the PG error — outer message names the query, the 42P01 code and
    // "relation does not exist" live on the cause.
    const driftError = new Error(
      'Failed query: select count(*) from "suggested_actions" where ("suggested_actions"."user_id" = $1 and "suggested_actions"."status" = $2 and ("suggested_actions"."kind" <> $3 and "suggested_actions"."kind" not ilike $4 and "suggested_actions"."kind" not ilike $5 and "suggested_actions"."kind" not ilike $6))',
      {
        cause: Object.assign(
          new Error('relation "suggested_actions" does not exist'),
          { code: '42P01' }
        ),
      }
    );
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      fail(driftError), // Inbox suggested-actions count read fails on drift
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const result = await getDashboardData();

    // The shell still renders and the Inbox fails open — never hidden by a
    // transient data failure.
    expect(result.inboxNavigation).toEqual({
      state: 'unknown',
      pendingCount: null,
    });

    // Known drift is log-only: no Sentry error event may be emitted.
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('schema drift')
    );

    // Sibling reads are unaffected.
    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 1024,
      height: 1024,
    });
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('degrades the Inbox tour-dates count log-only on statement timeout (JOV-5754)', async () => {
    // Prod fingerprint of Sentry issue 7702916052: the tour_dates pending-count
    // read fails with a PG statement timeout (57014) during Neon cold starts.
    // Drizzle wraps the PG error — the outer message names the count query,
    // the timeout text lives on the cause.
    const timeoutError = new Error(
      'Failed query: select count(*) from "tour_dates" where ("tour_dates"."profile_id" = $1 and "tour_dates"."confirmation_status" = $2)',
      {
        cause: Object.assign(
          new Error('canceling statement due to statement timeout'),
          { code: '57014' }
        ),
      }
    );
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // Inbox suggested-actions count succeeds
      fail(timeoutError), // Inbox tour-dates count read times out
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const result = await getDashboardData();

    // The shell still renders and the Inbox fails open — never hidden by a
    // transient data failure.
    expect(result.inboxNavigation).toEqual({
      state: 'unknown',
      pendingCount: null,
    });

    // Expected transient failure is log-only: no Sentry error event may be
    // emitted for a read that is designed to fail open.
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('timed out')
    );

    // Sibling reads are unaffected.
    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 1024,
      height: 1024,
    });
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('still reports genuine Inbox count failures to Sentry', async () => {
    // Guardrail for the JOV-5754 downgrade: only known transient timeouts and
    // schema drift go log-only — any other failure must still be reported.
    const realError = new Error('boom: tour_dates read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // Inbox suggested-actions count succeeds
      fail(realError), // Inbox tour-dates count read fails unexpectedly
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const result = await getDashboardData();

    expect(result.inboxNavigation).toEqual({
      state: 'unknown',
      pendingCount: null,
    });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      realError,
      expect.objectContaining({
        tags: expect.objectContaining({
          context: 'inbox_navigation_availability',
        }),
      })
    );
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('confines an avatar-quality failure — tipping stats still load', async () => {
    const realAvatarError = new Error('boom: profile_photos read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // settled Inbox suggested-actions count
      ok([{ count: 0 }]), // settled Inbox tour-dates count
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      fail(realAvatarError), // avatar quality read fails
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const result = await getDashboardData();

    expect(result.avatarQuality).toEqual({
      status: 'unknown',
      width: null,
      height: null,
    });
    expect(result.hasSocialLinks).toBe(true);
    expect(result.hasMusicLinks).toBe(true);
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.tippingStats.tipClicks).toBe(3);

    expect(captureExceptionMock).toHaveBeenCalledWith(
      realAvatarError,
      expect.objectContaining({
        tags: expect.objectContaining({ query: 'avatar_quality' }),
      })
    );
    expect(capturedCascadeErrors()).toEqual([]);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('degrades a tipping click-count timeout without emitting a Sentry issue (JOV-4458)', async () => {
    const timeoutError = new Error(
      "Failed query: select count(*), count(*) filter (where (\"metadata\"->>'source') = 'qr'), count(*) filter (where (\"metadata\"->>'source') = 'link') from \"click_events\"",
      {
        cause: Object.assign(
          new Error('canceling statement due to statement timeout'),
          { code: '57014' }
        ),
      }
    );
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // settled Inbox suggested-actions count
      ok([{ count: 0 }]), // settled Inbox tour-dates count
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      fail(timeoutError) // click-source aggregate times out
    );

    const result = await getDashboardData();

    expect(result.tippingStats).toEqual({
      tipClicks: 0,
      qrTipClicks: 0,
      linkTipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('tipping stats query timed out')
    );
    expect(capturedCascadeErrors()).toEqual([]);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('confines a tipping-stats failure — bio-link activation still resolves', async () => {
    const realTippingError = new Error('boom: tips aggregate failed');
    const activationDate = new Date('2026-07-21T12:00:00.000Z');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]), // settled Inbox suggested-actions count
      ok([{ count: 0 }]), // settled Inbox tour-dates count
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      fail(realTippingError), // tipping aggregate read fails
      ok([{ createdAt: activationDate, eventType: 'activated' }])
    );

    const result = await getDashboardData();

    // Tipping fell back to empty stats with the real error reported.
    expect(result.tippingStats.totalReceivedCents).toBe(0);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      realTippingError,
      expect.objectContaining({
        tags: expect.objectContaining({ query: 'tipping_stats' }),
      })
    );

    // The bio-link activation read still ran on its own transaction.
    expect(result.bioLinkActivation?.activatedAt).toBe(
      activationDate.toISOString()
    );

    expect(capturedCascadeErrors()).toEqual([]);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('JOV-8574: loads activation events without a request-path schema probe', async () => {
    const { doesTableExist } = await import('@/lib/db');
    vi.mocked(doesTableExist).mockRejectedValue(
      new Error('tableExists timeout after 15000ms')
    );
    const activatedAt = new Date('2026-07-21T12:00:00.000Z');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }]),
      ok([{ createdAt: activatedAt, eventType: 'activated' }])
    );

    const result = await getDashboardData();

    expect(doesTableExist).not.toHaveBeenCalled();
    expect(result.bioLinkActivation?.activatedAt).toBe(
      activatedAt.toISOString()
    );
    expect(result.dashboardLoadError).toBeUndefined();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(txStates.every(state => state.closed)).toBe(true);
  });

  it('JOV-8574: rolls back a missing distribution table before returning activation fallback', async () => {
    const { doesTableExist } = await import('@/lib/db');
    const missingTable = Object.assign(
      new Error('relation creator_distribution_events does not exist'),
      { code: '42P01' }
    );
    loggerWarnMock.mockImplementation(message => {
      if (
        String(message).includes('creator_distribution_events table missing')
      ) {
        expect(txStates.at(-1)?.rolledBack).toBe(true);
        expect(txStates.at(-1)?.closed).toBe(true);
      }
    });
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }]),
      fail(new Error('Failed query', { cause: missingTable }))
    );

    const result = await getDashboardData();

    expect(doesTableExist).not.toHaveBeenCalled();
    expect(result.bioLinkActivation?.activatedAt).toBeNull();
    expect(result.dashboardLoadError).toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('creator_distribution_events table missing'),
      expect.anything()
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(capturedCascadeErrors()).toEqual([]);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    expect(txStates.every(state => state.closed)).toBe(true);
  });

  it('waits for SQL cancellation before activation fallback without probing schema', async () => {
    const { doesTableExist } = await import('@/lib/db');
    const { dashboardQuery, setStatementTimeout } = await import(
      '@/lib/db/query-timeout'
    );
    const error = Object.assign(
      new Error('canceling statement due to statement timeout'),
      { code: '57014' }
    );
    captureExceptionMock.mockImplementation(captured => {
      if (captured === error) {
        expect(txStates.at(-1)?.closed).toBe(true);
        expect(txStates.at(-1)?.rolledBack).toBe(true);
      }
    });
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }]),
      fail(error)
    );
    const result = await getDashboardData();
    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(result.bioLinkActivation?.activatedAt).toBeNull();
    expect(result.dashboardLoadError).toBeUndefined();
    expect(setStatementTimeout).toHaveBeenCalledWith(expect.anything(), 8000);
    expect(
      vi
        .mocked(dashboardQuery)
        .mock.calls.some(
          call => call[1] === 'Creator distribution events query'
        )
    ).toBe(false);
    expect(captureExceptionMock).toHaveBeenCalledWith(error, expect.anything());
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    expect(txStates.every(state => state.closed)).toBe(true);
    expect(doesTableExist).not.toHaveBeenCalled();
  });

  it('retries a dropped distribution connection once on a fresh transaction after cleanup', async () => {
    const activatedAt = new Date('2026-07-21T12:00:00.000Z');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }]),
      fail(new Error('server conn crashed?')),
      () => {
        expect(txStates.at(-2)?.closed).toBe(true);
        expect(txStates.at(-2)?.poisoned).toBe(true);
        expect(txStates.at(-2)?.rolledBack).toBe(true);
        return { rows: [{ createdAt: activatedAt, eventType: 'activated' }] };
      }
    );
    const result = await getDashboardData();
    expect(result.bioLinkActivation?.activatedAt).toBe(
      activatedAt.toISOString()
    );
    expect(result.dashboardLoadError).toBeUndefined();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(txStates.every(state => state.closed)).toBe(true);
  });

  it.each([
    { label: 'SQLSTATE 25P03', code: '25P03' },
    { label: 'the exact code-less idle cause', code: undefined },
  ])(
    'JOV-8586: recovers $label only after failed distribution cleanup',
    async ({ code }) => {
      const idle = idleDistributionError(code);
      const activatedAt = new Date('2026-07-21T12:00:00.000Z');
      let releaseCleanup!: () => void;
      let signalCleanup!: () => void;
      const cleanupStarted = new Promise<void>(resolve => {
        signalCleanup = resolve;
      });
      const cleanupReleased = new Promise<void>(resolve => {
        releaseCleanup = resolve;
      });
      cleanupGates.set(4, () => {
        signalCleanup();
        return cleanupReleased;
      });
      const { setStatementTimeout } = await import('@/lib/db/query-timeout');
      let attempts = 0;
      vi.mocked(setStatementTimeout).mockImplementation(async (_tx, ms) => {
        if (ms === 8000 && txStates.length >= 5 && ++attempts === 1) {
          txStates[4].poisoned = true;
          throw idle;
        }
      });
      queueReadsBeforeDistribution();
      outcomes.push(() => {
        expect(txStates[4]).toMatchObject({ closed: true, rolledBack: true });
        expect(txStates[5]).toMatchObject({ closed: false, poisoned: false });
        return { rows: [{ createdAt: activatedAt, eventType: 'activated' }] };
      });
      const resultPromise = getDashboardData();
      await cleanupStarted;
      try {
        expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
        expect(txStates[4].closed).toBe(false);
        expect(captureExceptionMock).not.toHaveBeenCalled();
      } finally {
        releaseCleanup();
      }
      const result = await resultPromise;
      expect(result.bioLinkActivation?.activatedAt).toBe(
        activatedAt.toISOString()
      );
      expect(attempts).toBe(2);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
      expect(withDbSessionTxMock).toHaveBeenNthCalledWith(
        6,
        expect.any(Function),
        { clerkUserId: 'user_123' }
      );
      expect(txStates.every(state => state.closed)).toBe(true);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    }
  );

  it('JOV-8586: awaits asynchronous SQL timeout setup before any distribution query or recovery', async () => {
    const idle = idleDistributionError('25P03');
    const activatedAt = new Date('2026-07-21T12:00:00.000Z');
    let rejectSetup!: (error: Error) => void;
    let signalSetup!: () => void;
    const setupStarted = new Promise<void>(resolve => {
      signalSetup = resolve;
    });
    const pendingSetup = new Promise<void>((_resolve, reject) => {
      rejectSetup = reject;
    });
    void pendingSetup.catch(() => {});
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    let attempts = 0;
    vi.mocked(setStatementTimeout).mockImplementation(async (_tx, ms) => {
      if (ms === 8000 && txStates.length >= 5 && ++attempts === 1) {
        signalSetup();
        await pendingSetup;
      }
    });
    let queryStarted = false;
    queueReadsBeforeDistribution();
    outcomes.push(() => {
      queryStarted = true;
      expect(txStates[4]).toMatchObject({ closed: true, rolledBack: true });
      return { rows: [{ createdAt: activatedAt, eventType: 'activated' }] };
    });
    const resultPromise = getDashboardData();
    await setupStarted;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
      expect(queryStarted).toBe(false);
      expect(txStates[4].closed).toBe(false);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    } finally {
      rejectSetup(idle);
    }
    const result = await resultPromise;
    expect(result.bioLinkActivation?.activatedAt).toBe(
      activatedAt.toISOString()
    );
    expect(attempts).toBe(2);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('JOV-8586: stops after two idle setup failures and reports only after both transactions close', async () => {
    const idle = idleDistributionError('25P03');
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    let attempts = 0;
    vi.mocked(setStatementTimeout).mockImplementation(async (_tx, ms) => {
      if (ms === 8000 && txStates.length >= 5) {
        attempts++;
        throw idle;
      }
    });
    captureExceptionMock.mockImplementation(error => {
      if (error === idle) {
        expect(txStates.slice(4)).toHaveLength(2);
        expect(
          txStates.slice(4).every(state => state.closed && state.rolledBack)
        ).toBe(true);
      }
    });
    queueReadsBeforeDistribution();
    const result = await getDashboardData();
    expect(result.bioLinkActivation?.activatedAt).toBeNull();
    expect(result.dashboardLoadError).toBeUndefined();
    expect(attempts).toBe(2);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      idle,
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ query: 'creator_distribution_events' }),
      })
    );
  });

  it.each([
    { code: '57014', message: 'canceling statement due to statement timeout' },
    {
      code: '25P02',
      message: 'terminating connection due to idle-in-transaction timeout',
    },
    {
      code: '42501',
      message: 'terminating connection due to idle-in-transaction timeout',
    },
    {
      code: '40001',
      message: 'terminating connection due to idle-in-transaction timeout',
    },
  ])(
    'JOV-8586: keeps authoritative $code distribution failures single-attempt',
    async ({ code, message }) => {
      const error = new Error('Failed query: SELECT set_config', {
        cause: Object.assign(new Error(message), { code }),
      });
      const { setStatementTimeout } = await import('@/lib/db/query-timeout');
      vi.mocked(setStatementTimeout).mockImplementation(async (_tx, ms) => {
        if (ms === 8000 && txStates.length >= 5) throw error;
      });
      queueReadsBeforeDistribution();
      const result = await getDashboardData();
      expect(result.bioLinkActivation?.activatedAt).toBeNull();
      expect(result.dashboardLoadError).toBeUndefined();
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
      expect(
        vi
          .mocked(setStatementTimeout)
          .mock.calls.slice(1)
          .filter(([, ms]) => ms === 8000)
      ).toHaveLength(1);
      expect(txStates[4]).toMatchObject({ closed: true, rolledBack: true });
      expect(captureExceptionMock).toHaveBeenCalledWith(
        error,
        expect.anything()
      );
    }
  );

  it('JOV-8586: retries pre-callback RLS setup failure within the same two-attempt boundary', async () => {
    const idle = idleDistributionError('25P03');
    const activatedAt = new Date('2026-07-21T12:00:00.000Z');
    setupFailures.set(4, fail(idle));
    queueReadsBeforeDistribution();
    outcomes.push(() => {
      expect(txStates[4]).toMatchObject({ closed: true, rolledBack: true });
      return { rows: [{ createdAt: activatedAt, eventType: 'activated' }] };
    });
    const result = await getDashboardData();
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    expect(result.bioLinkActivation?.activatedAt).toBe(
      activatedAt.toISOString()
    );
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(
      vi
        .mocked(setStatementTimeout)
        .mock.calls.slice(1)
        .filter(([, ms]) => ms === 8000)
    ).toHaveLength(1);
    expect(txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('happy path assembles full dashboard data across isolated reads', async () => {
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: true }]),
      ok([{ count: 0 }]), // settled Inbox suggested-actions count
      ok([{ count: 0 }]), // settled Inbox tour-dates count
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 256, height: 256 }]),
      ok([{ totalReceived: 250, monthReceived: 125, tipsSubmitted: 4 }]),
      ok([{ total: 5, qr: 2, link: 3 }])
    );

    const result = await getDashboardData();

    expect(result.user?.id).toBe('user_db_1');
    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(result.sidebarCollapsed).toBe(true);
    expect(result.hasSocialLinks).toBe(true);
    expect(result.hasMusicLinks).toBe(true);
    expect(result.avatarQuality).toEqual({
      status: 'low',
      width: 256,
      height: 256,
    });
    expect(result.tippingStats).toEqual({
      tipClicks: 5,
      qrTipClicks: 2,
      linkTipClicks: 3,
      tipsSubmitted: 4,
      totalReceivedCents: 250,
      monthReceivedCents: 125,
    });
    expect(result.dashboardLoadError).toBeUndefined();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });
  it('JOV-8580-recovery: recovers avatar metadata on a fresh transaction after idle setup cleanup', async () => {
    const idle = new Error('Failed query: SELECT set_config', {
      cause: Object.assign(
        new Error('terminating connection due to idle-in-transaction timeout'),
        { code: '25P03' }
      ),
    });
    setupFailures.set(2, fail(idle));
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      () => {
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
        expect(txStates[3]).toMatchObject({ closed: false, poisoned: false });
        return { rows: [{ width: 1024, height: 1024 }] };
      },
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );
    const result = await getDashboardData();
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 1024,
      height: 1024,
    });
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(setStatementTimeout).toHaveBeenCalledWith(expect.anything(), 5000);
    expect(txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('JOV-8580: waits for asynchronous timeout setup failure and cleanup before fallback or tipping', async () => {
    const timeout = Object.assign(
      new Error('canceling statement due to statement timeout'),
      { code: '57014' }
    );
    let rejectTimeout!: (error: Error) => void;
    let signalSetup!: () => void;
    const setupStarted = new Promise<void>(resolve => {
      signalSetup = resolve;
    });
    const pendingSetup = new Promise<void>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    // Keep the mutation proof from producing an unhandled rejection if the
    // source accidentally stops awaiting timeout setup.
    void pendingSetup.catch(() => {});
    const { setStatementTimeout } = await import('@/lib/db/query-timeout');
    vi.mocked(setStatementTimeout).mockImplementation(async (_tx, ms) => {
      if (ms === 5000) {
        signalSetup();
        await pendingSetup;
      }
    });
    let avatarOrTippingStarted = false;
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      () => {
        avatarOrTippingStarted = true;
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
        return {
          rows: [{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }],
        };
      },
      ok([{ total: 3, qr: 1, link: 2 }])
    );
    captureExceptionMock.mockImplementation(error => {
      if (error === timeout) {
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
      }
    });
    const resultPromise = getDashboardData();
    await setupStarted;
    // Drain already-admitted work so an omitted await cannot pass by timing.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
      expect(avatarOrTippingStarted).toBe(false);
      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(txStates).toHaveLength(3);
      expect(txStates[2].closed).toBe(false);
    } finally {
      rejectTimeout(timeout);
    }
    const result = await resultPromise;
    expect(result.avatarQuality?.status).toBe('unknown');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(
      vi.mocked(setStatementTimeout).mock.calls.filter(([, ms]) => ms === 5000)
    ).toHaveLength(1);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      timeout,
      expect.objectContaining({
        tags: expect.objectContaining({ query: 'avatar_quality' }),
      })
    );
    expect(txStates.every(state => state.closed)).toBe(true);
  });

  it('JOV-8580: stops after two idle setup failures and reports fallback only after cleanup', async () => {
    const idle = Object.assign(
      new Error('terminating connection due to idle-in-transaction timeout'),
      { code: '25P03' }
    );
    setupFailures.set(2, fail(idle));
    setupFailures.set(3, fail(idle));
    captureExceptionMock.mockImplementation(error => {
      if (error === idle) {
        expect(txStates[2]).toMatchObject({ closed: true, rolledBack: true });
        expect(txStates[3]).toMatchObject({ closed: true, rolledBack: true });
      }
    });
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );
    const result = await getDashboardData();
    expect(result.avatarQuality?.status).toBe('unknown');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      idle,
      expect.objectContaining({
        tags: expect.objectContaining({ query: 'avatar_quality' }),
      })
    );
    expect(capturedCascadeErrors()).toEqual([]);
    expect(txStates.every(state => state.closed)).toBe(true);
  });

  it('JOV-8580: recovers code-less wrapped idle setup errors without losing query results', async () => {
    setupFailures.set(
      2,
      fail(
        new Error('Failed query: SELECT set_config', {
          cause: new Error(
            'terminating connection due to idle-in-transaction timeout'
          ),
        })
      )
    );
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
    const result = await getDashboardData();
    expect(result.avatarQuality).toEqual({
      status: 'ok',
      width: 1024,
      height: 1024,
    });
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['57014', 'canceling statement due to statement timeout'],
    [
      '42501',
      'permission denied: idle-in-transaction timeout text is not authoritative',
    ],
  ])(
    'JOV-8580: does not replay avatar setup for SQLSTATE %s',
    async (code, message) => {
      setupFailures.set(
        2,
        fail(
          new Error('Failed query: SELECT set_config', {
            cause: Object.assign(new Error(message), { code }),
          })
        )
      );
      outcomes.push(
        ok([userRow]),
        ok([dashboardProfile]),
        ok([{ sidebarCollapsed: false }]),
        ok([{ count: 0 }]),
        ok([{ count: 0 }]),
        ok([{ hasLinks: true, hasMusicLinks: true }]),
        ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
        ok([{ total: 3, qr: 1, link: 2 }])
      );
      const result = await getDashboardData();
      expect(result.avatarQuality?.status).toBe('unknown');
      expect(result.tippingStats.totalReceivedCents).toBe(100);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
      expect(txStates.every(state => state.closed)).toBe(true);
    }
  );

  it('JOV-8580: declines another avatar attempt after the read retry budget expires', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    setupFailures.set(2, () => {
      clock.mockReturnValue(9000);
      return {
        error: Object.assign(
          new Error(
            'terminating connection due to idle-in-transaction timeout'
          ),
          { code: '25P03' }
        ),
      };
    });
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ count: 0 }]),
      ok([{ count: 0 }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );
    try {
      const result = await getDashboardData();
      expect(result.avatarQuality?.status).toBe('unknown');
      expect(result.tippingStats.totalReceivedCents).toBe(100);
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    } finally {
      clock.mockRestore();
    }
  });
});

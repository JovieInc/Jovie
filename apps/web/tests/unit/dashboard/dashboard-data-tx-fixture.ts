import { vi } from 'vitest';

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

type QueryResult = { rows?: unknown[]; error?: unknown };
type QueryOutcome = () => QueryResult | Promise<QueryResult>;

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
            settled = Promise.resolve()
              .then(outcome)
              .then(result => {
                if (result.error) {
                  throw result.error;
                }
                return result.rows ?? [];
              })
              .catch(error => {
                state.poisoned = true;
                throw error;
              });
          }
          return settled.then(onFulfilled, onRejected);
        };
        builder.catch = (onRejected: (reason: unknown) => unknown) =>
          Promise.resolve(builder).catch(onRejected);
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
        const setupError = (await setupFailures.get(transactionIndex)?.())
          ?.error;
        if (setupError) {
          state.poisoned = true;
          throw setupError;
        }
        const result = await handler(createTx(state), 'user_123');
        const commitError = (await commitFailures.get(transactionIndex)?.())
          ?.error;
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

vi.mock('@/lib/db/query-timeout', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/db/query-timeout')>();
  return {
    QUERY_TIMEOUTS: { dashboard: 8000, api: 5000, default: 5000 },
    setStatementTimeout: vi.fn(async () => {}),
    // Mirrors the real wrapper: statement_timeout is applied on the target
    // client before the query — on a poisoned transaction that set_config is
    // the statement that fails, which is exactly the production fingerprint.
    dashboardQuery: vi.fn(
      async (
        fn: () => Promise<unknown>,
        context?: string,
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
        return context === 'Creator profiles query'
          ? actual.dashboardQuery(fn, context)
          : fn();
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
        error.message.includes(
          'canceling statement due to statement timeout'
        ) ||
        error.message.includes('idle-in-transaction timeout') ||
        (error.cause instanceof Error &&
          isPostgresTimeoutErrorMock(error.cause))
      );
    },
  };
});

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

export type { QueryResult };
export {
  capturedCascadeErrors,
  capturedErrors,
  captureExceptionMock,
  cleanupGates,
  commitFailures,
  dashboardProfile,
  fail,
  idleDistributionError,
  loggerWarnMock,
  ok,
  outcomes,
  queueReadsBeforeDistribution,
  setupFailures,
  txStates,
  userRow,
  withDbSessionTxMock,
};

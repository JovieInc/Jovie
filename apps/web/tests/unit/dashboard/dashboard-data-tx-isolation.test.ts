import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type TxState = { poisoned: boolean };

const {
  captureExceptionMock,
  loggerErrorMock,
  outcomes,
  txStates,
  withDbSessionTxMock,
} = vi.hoisted(() => {
  const outcomes: QueryOutcome[] = [];
  const txStates: Array<{ poisoned: boolean }> = [];

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
      const state: TxState = { poisoned: false };
      txStates.push(state);
      return handler(createTx(state), 'user_123');
    }
  );

  return {
    captureExceptionMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    outcomes,
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

vi.mock('@sentry/nextjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>();
  return {
    ...actual,
    getClient: vi.fn(() => undefined),
    captureException: captureExceptionMock,
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    logger: {
      error: loggerErrorMock,
      warn: vi.fn(),
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
  isPostgresTimeoutError: (error: unknown) =>
    error instanceof Error &&
    error.message.includes('canceling statement due to statement timeout'),
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

describe('dashboard data transaction isolation (JOV-4189)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    outcomes.length = 0;
    txStates.length = 0;
  });

  it('confines a failing supplementary read to its own transaction — no 25P02 cascade', async () => {
    const realLinksError = new Error('boom: social_links read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      fail(realLinksError), // social links existence read fails
      ok([{ width: 1024, height: 1024 }]), // avatar quality read
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
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

    // Isolation mechanism: 1 base transaction + 4 per-read transactions.
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
  });

  it('confines an avatar-quality failure — tipping stats still load', async () => {
    const realAvatarError = new Error('boom: profile_photos read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      fail(realAvatarError), // avatar quality read fails
      ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
      ok([{ total: 3, qr: 1, link: 2 }])
    );

    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
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

  it('confines a tipping-stats failure — bio-link activation still resolves', async () => {
    const { doesTableExist } = await import('@/lib/db');
    vi.mocked(doesTableExist).mockResolvedValue(true);

    const realTippingError = new Error('boom: tips aggregate failed');
    const activationDate = new Date('2026-07-21T12:00:00.000Z');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 1024, height: 1024 }]),
      fail(realTippingError), // tipping aggregate read fails
      ok([{ createdAt: activationDate, eventType: 'activated' }])
    );

    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
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

  it('happy path assembles full dashboard data across isolated reads', async () => {
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: true }]),
      ok([{ hasLinks: true, hasMusicLinks: true }]),
      ok([{ width: 256, height: 256 }]),
      ok([{ totalReceived: 250, monthReceived: 125, tipsSubmitted: 4 }]),
      ok([{ total: 5, qr: 2, link: 3 }])
    );

    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';

/**
 * Inbox-navigation transport fail-soft degradation (JOV-12477).
 *
 * The dashboard shell's Inbox badge count (`countPendingCreatorInboxActions`)
 * runs inside the shared session transaction, so a Neon transport kill
 * (suspend/postmaster exit, dropped connection) cannot be replayed on the
 * same tx. The read is fail-open by design — the boundary must degrade
 * log-only for the transient transport class (the same doctrine the
 * avatar/social-links boundaries ship, JOV-8864/JOV-8900) instead of paging
 * Sentry with the raw drizzle wrapper fingerprint (Sentry 7846577230).
 *
 * Harness replicated from dashboard-data-tx-isolation.test.ts (that file is
 * pinned by the size-500 shrink-only baseline, so new coverage lives here).
 */

type QueryOutcome = () => { rows?: unknown[]; error?: unknown };

const { captureExceptionMock, loggerWarnMock, outcomes, withDbSessionTxMock } =
  vi.hoisted(() => {
    const outcomes: QueryOutcome[] = [];

    function createTx() {
      const tx = {
        execute: vi.fn(async () => ({ rows: [] })),
        select: vi.fn(() => {
          const outcome: QueryOutcome =
            outcomes.shift() ?? (() => ({ rows: [] }));
          const builder: Record<string, unknown> = {};
          const chain = () => builder;
          builder.from = chain;
          builder.where = chain;
          builder.limit = chain;
          builder.orderBy = chain;
          builder.then = (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => {
            let settled: Promise<unknown>;
            try {
              const result = outcome();
              if (result.error) {
                settled = Promise.reject(result.error);
              } else {
                settled = Promise.resolve(result.rows ?? []);
              }
            } catch (error) {
              settled = Promise.reject(error);
            }
            return settled.then(onFulfilled, onRejected);
          };
          return builder;
        }),
      };
      return tx;
    }

    const withDbSessionTxMock = vi.fn(
      async (handler: (tx: unknown, userId: string) => Promise<unknown>) =>
        handler(createTx(), 'user_123')
    );

    return {
      captureExceptionMock: vi.fn(),
      loggerWarnMock: vi.fn(),
      outcomes,
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
      error: vi.fn(),
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
  dashboardQuery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  isQueryTimeoutError: (error: unknown) =>
    error instanceof Error && error.name === 'QueryTimeoutError',
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

function queueHappyPathReads(): void {
  outcomes.push(
    ok([userRow]),
    ok([dashboardProfile]),
    ok([{ sidebarCollapsed: false }]),
    ok([{ count: 0 }]), // Inbox suggested-actions count
    ok([{ count: 0 }]), // Inbox tour-dates count
    ok([{ hasLinks: true, hasMusicLinks: true }]),
    ok([{ width: 1024, height: 1024 }]),
    ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
    ok([{ total: 3, qr: 1, link: 2 }])
  );
}

/**
 * Production-shaped transport kill on the suggested_actions pending count:
 * Drizzle wraps the PG error — the outer message names the count query, the
 * transport text lives on the cause.
 */
function inboxCountTransportKill(
  causeText: string,
  code?: string
): Error & { code?: string } {
  const cause = new Error(causeText);
  if (code) Object.assign(cause, { code });
  return new Error(
    'Failed query: select count(*) from "suggested_actions" where ("suggested_actions"."user_id" = $1 and "suggested_actions"."status" = $2 and (lower("suggested_actions"."kind") <> $3 and "suggested_actions"."kind" not ilike $4 and "suggested_actions"."kind" not ilike $5))',
    { cause }
  ) as Error & { code?: string };
}

describe('Inbox navigation transport fail-soft (JOV-12477)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    outcomes.length = 0;
  });

  it.each([
    ['connection terminated unexpectedly', '08000'],
    ['connection terminated unexpectedly', undefined],
    ['Connection reset by host', undefined],
  ])(
    'degrades a dropped-connection kill on the Inbox count log-only (%s, code %s)',
    async (causeText, code) => {
      outcomes.push(
        ok([userRow]),
        ok([dashboardProfile]),
        ok([{ sidebarCollapsed: false }]),
        fail(inboxCountTransportKill(causeText, code)), // transport kill
        ok([{ hasLinks: true, hasMusicLinks: true }]),
        ok([{ width: 1024, height: 1024 }]),
        ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
        ok([{ total: 3, qr: 1, link: 2 }])
      );

      const result = await getDashboardData();

      // Fail-open semantics preserved: the Inbox nav item is never hidden.
      expect(result.inboxNavigation).toEqual({
        state: 'unknown',
        pendingCount: null,
      });

      // Transient transport failures are log-only degradation — no Sentry
      // event for a read that is designed to fail open.
      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('transient transport failure')
      );

      // Sibling reads are unaffected.
      expect(result.avatarQuality).toEqual({
        status: 'ok',
        width: 1024,
        height: 1024,
      });
      expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    }
  );

  it('still reports genuine Inbox count failures to Sentry', async () => {
    // Guardrail for the JOV-12477 downgrade: only the transient transport
    // class goes log-only — any other failure must still be reported.
    const realError = new Error('boom: suggested_actions read failed');
    outcomes.push(
      ok([userRow]),
      ok([dashboardProfile]),
      ok([{ sidebarCollapsed: false }]),
      fail(realError), // Inbox suggested-actions count fails unexpectedly
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
  });

  it('keeps a healthy Inbox count read reporting the real pending count', async () => {
    queueHappyPathReads();

    const result = await getDashboardData();

    expect(result.inboxNavigation).toBeDefined();
    expect(result.inboxNavigation?.state).not.toBe('unknown');
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(5);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});

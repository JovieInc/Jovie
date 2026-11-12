import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  capturedCascadeErrors,
  fail,
  queueDashboardReads,
  queueRetriedReadOutcome,
  resetTxHarness,
  txHarness,
} from './dashboard-tx-recovery-harness';

/**
 * Regression tests for commit-wrapped transport recovery on the dashboard's
 * side-effect-free reads (JOV-12096 avatar, JOV-12188 social-links +
 * creator_distribution_events).
 *
 * Drizzle wraps a post-callback COMMIT transport failure as `Failed query:
 * commit`. Classifying that wrapper by its cause text misses shapes whose
 * cause chain carries none of the retryable transport vocabulary (undici
 * `fetch failed`, a bare WebSocket close, a generic Neon proxy error) — the
 * recovery then declines a replay-safe read and the degrade reporter pages
 * Sentry for a degradation that already returned its safe fallback. The
 * `Failed query: commit` wrapper shape alone is the replay-safety proof.
 *
 * Shared transaction harness: see dashboard-tx-recovery-harness.ts. The
 * poison/25P02 machinery lives only in dashboard-data-tx-isolation.test.ts
 * (pinned by the Company Guards size-500 per-file baseline and may not grow).
 */

const { captureExceptionMock, loggerErrorMock, loggerWarnMock } = vi.hoisted(
  () => ({
    captureExceptionMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  })
);

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

vi.mock('@/lib/auth/session', async () => {
  const harness = await import('./dashboard-tx-recovery-harness');
  return { withDbSessionTx: harness.withDbSessionTx };
});

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

// The harness owns the withDbSessionTx mock target: see
// dashboard-tx-recovery-harness.ts.
const commitFetchFailed = () =>
  new Error('Failed query: commit', { cause: new Error('fetch failed') });

describe('avatar commit-wrapped transport recovery (JOV-12096)', () => {
  beforeEach(() => {
    resetTxHarness();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it('recovers a commit-wrapped transport failure whose cause text matches no retryable pattern', async () => {
    txHarness.commitFailures.set(2, fail(commitFetchFailed()));
    queueDashboardReads();
    // Both avatar attempts consume one profilePhotos outcome each: the first
    // attempt's rows are discarded by its failed commit, so the retry needs
    // its own queued read inserted after the first avatar outcome.
    queueRetriedReadOutcome(() => {
      // Recovery starts only after the failed transaction fully closed and
      // was discarded — never on the poisoned, still-open connection.
      expect(txHarness.txStates[2]).toMatchObject({
        closed: true,
        rolledBack: true,
      });
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
    expect(txHarness.txStates).toHaveLength(6);
    expect(txHarness.txStates[2]).toMatchObject({
      closed: true,
      rolledBack: true,
    });
    expect(txHarness.txStates[3]).toMatchObject({
      closed: true,
      rolledBack: false,
    });
    expect(txHarness.txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(
      capturedCascadeErrors(
        captureExceptionMock.mock.calls.map(call => call[0])
      )
    ).toEqual([]);
  });

  it('degrades a twice-failed commit-wrapped transport failure log-only', async () => {
    const firstCommit = commitFetchFailed();
    const secondCommit = commitFetchFailed();
    txHarness.commitFailures.set(2, fail(firstCommit));
    txHarness.commitFailures.set(3, fail(secondCommit));
    loggerWarnMock.mockImplementation((message: string) => {
      if (message.includes('[avatar-quality]')) {
        expect(txHarness.txStates[2]).toMatchObject({
          closed: true,
          rolledBack: true,
        });
        expect(txHarness.txStates[3]).toMatchObject({
          closed: true,
          rolledBack: true,
        });
        expect(message).toContain('transient DB condition');
      }
    });
    queueDashboardReads();
    // Both avatar attempts consume one profilePhotos outcome each before
    // their commits die; the retry needs its own queued read.
    queueRetriedReadOutcome([{ width: 1024, height: 1024 }]);

    const result = await getDashboardData();

    expect(result.avatarQuality?.status).toBe('unknown');
    expect(result.tippingStats.totalReceivedCents).toBe(100);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(txHarness.txStates).toHaveLength(6);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[avatar-quality] transient DB condition after retry; degrading to unknown quality',
      expect.objectContaining({
        profileId: 'profile_1',
        error: expect.stringContaining('fetch failed'),
      })
    );
    expect(
      capturedCascadeErrors(
        captureExceptionMock.mock.calls.map(call => call[0])
      )
    ).toEqual([]);
    expect(txHarness.txStates.every(state => state.closed)).toBe(true);
  });
});

describe('social-links commit-wrapped transport recovery (JOV-12188)', () => {
  beforeEach(() => {
    resetTxHarness();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it('recovers the social-links existence read once on a commit-wrapped transport failure', async () => {
    txHarness.commitFailures.set(1, fail(commitFetchFailed()));
    queueDashboardReads();
    // The retried social-links transaction needs its own queued read: the
    // first attempt's rows are discarded by its failed commit. The retry's
    // select runs right after the original hasLinks outcome (index 5).
    queueRetriedReadOutcome([{ hasLinks: true, hasMusicLinks: true }], 6);

    const result = await getDashboardData();

    expect(result.hasSocialLinks).toBe(true);
    expect(result.hasMusicLinks).toBe(true);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(txHarness.txStates).toHaveLength(6);
    expect(txHarness.txStates[1]).toMatchObject({
      closed: true,
      rolledBack: true,
    });
    expect(txHarness.txStates[2]).toMatchObject({
      closed: true,
      rolledBack: false,
    });
    expect(txHarness.txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('degrades a twice-failed social-links commit log-only', async () => {
    txHarness.commitFailures.set(1, fail(commitFetchFailed()));
    txHarness.commitFailures.set(2, fail(commitFetchFailed()));
    queueDashboardReads();
    queueRetriedReadOutcome([{ hasLinks: true, hasMusicLinks: true }], 6);

    const result = await getDashboardData();

    expect(result.hasSocialLinks).toBe(false);
    expect(result.hasMusicLinks).toBe(false);
    expect(result.dashboardLoadError).toBeUndefined();
    expect(txHarness.txStates).toHaveLength(6);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[social-links] transient commit failure after retry; degrading to link-free defaults',
      expect.objectContaining({
        error: expect.stringContaining('fetch failed'),
      })
    );
  });
});

describe('bio-link commit-wrapped transport recovery (JOV-12188)', () => {
  beforeEach(() => {
    resetTxHarness();
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it('recovers the creator_distribution_events read once on a commit-wrapped transport failure', async () => {
    // No avatar retry here: base(0), links(1), avatar(2), tipping(3), bio(4).
    txHarness.commitFailures.set(4, fail(commitFetchFailed()));
    queueDashboardReads();

    const result = await getDashboardData();

    expect(result.bioLinkActivation).not.toBeNull();
    expect(result.dashboardLoadError).toBeUndefined();
    expect(txHarness.txStates).toHaveLength(6);
    expect(txHarness.txStates[4]).toMatchObject({
      closed: true,
      rolledBack: true,
    });
    expect(txHarness.txStates[5]).toMatchObject({
      closed: true,
      rolledBack: false,
    });
    expect(txHarness.txStates.every(state => state.closed)).toBe(true);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('degrades a twice-failed creator_distribution_events commit log-only', async () => {
    txHarness.commitFailures.set(4, fail(commitFetchFailed()));
    txHarness.commitFailures.set(5, fail(commitFetchFailed()));
    queueDashboardReads();

    const result = await getDashboardData();

    // The tolerate-and-degrade catch returns empty event rows, which still
    // resolves to an activation object with null timestamps.
    expect(result.bioLinkActivation).not.toBeNull();
    expect(result.dashboardLoadError).toBeUndefined();
    expect(txHarness.txStates).toHaveLength(6);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[Dashboard] creator_distribution_events transient commit failure after retry; skipping activation lookup',
      expect.objectContaining({ profileId: 'profile_1' })
    );
  });
});

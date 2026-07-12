import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coverage for gate.ts's user-creation resilience path: createUserWithRetry's
 * exponential-backoff retry loop + permanent/transient error classification,
 * and handleMissingDbUser's terminal branches (EMAIL_REQUIRED_FOR_USER_CREATION,
 * USER_CREATION_FAILED). Neither function is exported, so these tests drive
 * them indirectly through the public `resolveUserState()` entry point — the
 * same approach as gate.critical.test.ts.
 *
 * E2E only exercises the happy path where the first insert succeeds; these
 * tests lock in what happens when the DB is flaky during the post-OTP/OAuth
 * user-creation window (a real, previously-unverified failure mode).
 */

const {
  mockGetSession,
  mockGetCachedDevTestAuthSession,
  mockDbSelect,
  mockDbInsert,
  mockIsWaitlistGateEnabled,
  mockCheckUserStatus,
  mockNormalizeEmail,
  mockCaptureError,
  mockCaptureCriticalError,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(false),
  mockCheckUserStatus: vi.fn(),
  mockNormalizeEmail: vi.fn((e: string) => e?.toLowerCase().trim() ?? e),
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
  mockCaptureCriticalError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    betterAuthUserId: 'users.betterAuthUserId',
    email: 'users.email',
    userStatus: 'users.userStatus',
    isAdmin: 'users.isAdmin',
    isPro: 'users.isPro',
    deletedAt: 'users.deletedAt',
    waitlistEntryId: 'users.waitlistEntryId',
    activeProfileId: 'users.activeProfileId',
    updatedAt: 'users.updatedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    displayName: 'creatorProfiles.displayName',
    isPublic: 'creatorProfiles.isPublic',
    avatarUrl: 'creatorProfiles.avatarUrl',
    onboardingCompletedAt: 'creatorProfiles.onboardingCompletedAt',
    isClaimed: 'creatorProfiles.isClaimed',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {
    id: 'waitlistEntries.id',
    email: 'waitlistEntries.email',
    emailNormalized: 'waitlistEntries.emailNormalized',
    status: 'waitlistEntries.status',
    canonical: 'waitlistEntries.canonical',
    createdAt: 'waitlistEntries.createdAt',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: mockNormalizeEmail,
}));

vi.mock('@/lib/auth/status-checker', () => ({
  checkUserStatus: mockCheckUserStatus,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings,
      values,
    }),
    { raw: vi.fn() }
  ),
  desc: vi.fn(col => ({ desc: col })),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  addBreadcrumb: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Disable request memoization so each call is independent in tests
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';

/** Mimics the `.from().leftJoin().where().limit()` / `.from().where().limit()` /
 * `.from().where().orderBy().limit()` query shapes gate.ts builds off `db.select()`. */
function chainLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

/** Mimics `db.insert(users).values(...).onConflictDoUpdate(...).returning(...)`. */
function insertChain(outcome: { resolve: unknown[] } | { reject: unknown }) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning:
          'resolve' in outcome
            ? vi.fn().mockResolvedValue(outcome.resolve)
            : vi.fn().mockRejectedValue(outcome.reject),
      }),
    }),
  };
}

describe('gate.ts user-creation resilience (createUserWithRetry / handleMissingDbUser)', () => {
  /** Delay (ms) passed to each setTimeout call, in call order. */
  let delaysUsed: number[];

  beforeEach(() => {
    vi.resetAllMocks();
    delaysUsed = [];

    mockIsWaitlistGateEnabled.mockResolvedValue(false);
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockCheckUserStatus.mockReturnValue({
      isBlocked: false,
      blockedState: null,
      redirectTo: null,
    });
    mockCaptureError.mockResolvedValue(undefined);
    mockCaptureCriticalError.mockResolvedValue(undefined);

    // Replace the real backoff timer with a synchronous stand-in that records
    // the requested delay and resolves immediately, so the retry loop's
    // exponential backoff is exercised without slowing down the test suite.
    vi.stubGlobal(
      'setTimeout',
      vi.fn((cb: (...args: unknown[]) => void, delay?: number) => {
        delaysUsed.push(delay ?? 0);
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries transient errors with exponential backoff and succeeds on the 3rd attempt', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_new_user', email: 'new@example.com' },
      session: { id: 'sess_new' },
    });

    mockDbSelect
      // loadAuthGateRecord: no existing DB user
      .mockReturnValueOnce(chainLimit([]))
      // createUserWithRetry attempt 0: existingUserData lookup
      .mockReturnValueOnce(chainLimit([]))
      // attempt 1: existingUserData lookup
      .mockReturnValueOnce(chainLimit([]))
      // attempt 2: existingUserData lookup
      .mockReturnValueOnce(chainLimit([]))
      // post-create status read
      .mockReturnValueOnce(
        chainLimit([{ userStatus: 'waitlist_approved', deletedAt: null }])
      );

    const transientError = new Error('Connection terminated unexpectedly');
    mockDbInsert
      .mockReturnValueOnce(insertChain({ reject: transientError }))
      .mockReturnValueOnce(insertChain({ reject: transientError }))
      .mockReturnValueOnce(insertChain({ resolve: [{ id: 'new_db_user_1' }] }));

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
    expect(result.redirectTo).toBe('/start?fresh_signup=true');
    expect(result.dbUserId).toBe('new_db_user_1');

    // Exactly 3 insert attempts — 2 transient failures + 1 success.
    expect(mockDbInsert).toHaveBeenCalledTimes(3);

    // Backoff is Math.min(1000 * attempt, 3000), and attempt 0 has no delay
    // (only invoked before attempts 1 and 2).
    expect(delaysUsed).toEqual([1000, 2000]);

    // One captureError call per failed attempt, tagged with the attempt number.
    expect(mockCaptureError).toHaveBeenCalledTimes(2);
    expect(mockCaptureError.mock.calls[0][0]).toContain('attempt 1/3');
    expect(mockCaptureError.mock.calls[1][0]).toContain('attempt 2/3');

    // Recovered before exhausting retries — no critical-failure report.
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
  });

  it('stops immediately on a permanent error without retrying', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_permanent', email: 'permanent@example.com' },
      session: { id: 'sess_permanent' },
    });

    mockDbSelect
      // loadAuthGateRecord: no existing DB user
      .mockReturnValueOnce(chainLimit([]))
      // createUserWithRetry attempt 0: existingUserData lookup
      .mockReturnValueOnce(chainLimit([]));

    // Not a `users_email_unique` violation (no pg `code`/`constraint`), but the
    // message matches isPermanentError's generic "duplicate key"/"constraint"
    // fallback check — this is the permanent branch, distinct from the
    // recoverable email-uniqueness-adoption path.
    const permanentError = new Error(
      'duplicate key value violates unique constraint "users_pkey"'
    );
    mockDbInsert.mockReturnValueOnce(insertChain({ reject: permanentError }));

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.USER_CREATION_FAILED);
    expect(result.dbUserId).toBeNull();
    expect(result.redirectTo).toBe('/error/user-creation-failed');
    expect(result.context.errorCode).toBe('USER_CREATION_FAILED');

    // Exactly 1 attempt — isPermanentError breaks the loop immediately.
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockDbSelect).toHaveBeenCalledTimes(2); // loadAuthGateRecord + 1 attempt
    expect(delaysUsed).toEqual([]); // no retry means no backoff delay was ever used

    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError.mock.calls[0][0]).toContain('attempt 1/3');
    // KNOWN BUG (documented, not fixed — see task notes): a single terminal
    // creation failure reports TWO captureCriticalError calls — one from
    // createUserWithRetry itself ("...after 3 attempts") and a second,
    // redundant one from handleMissingDbUser ("...after retries") once it
    // sees a null return. This doubles Sentry noise for one real failure.
    expect(mockCaptureCriticalError).toHaveBeenCalledTimes(2);
    expect(mockCaptureCriticalError.mock.calls[0][0]).toContain(
      'after 3 attempts'
    );
    expect(mockCaptureCriticalError.mock.calls[1][0]).toBe(
      'User creation failed after retries'
    );
  });

  it('exhausts all 3 attempts and reports USER_CREATION_FAILED when every attempt is transient', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_exhausted', email: 'exhausted@example.com' },
      session: { id: 'sess_exhausted' },
    });

    mockDbSelect
      .mockReturnValueOnce(chainLimit([])) // loadAuthGateRecord
      .mockReturnValueOnce(chainLimit([])) // attempt 0
      .mockReturnValueOnce(chainLimit([])) // attempt 1
      .mockReturnValueOnce(chainLimit([])); // attempt 2

    const transientError = new Error('Connection terminated unexpectedly');
    mockDbInsert
      .mockReturnValueOnce(insertChain({ reject: transientError }))
      .mockReturnValueOnce(insertChain({ reject: transientError }))
      .mockReturnValueOnce(insertChain({ reject: transientError }));

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.USER_CREATION_FAILED);
    expect(result.dbUserId).toBeNull();
    expect(result.context.errorCode).toBe('USER_CREATION_FAILED');

    // All 3 attempts made — never classified as permanent, so the loop runs
    // to its maxRetries bound rather than stopping early.
    expect(mockDbInsert).toHaveBeenCalledTimes(3);
    expect(delaysUsed).toEqual([1000, 2000]);

    expect(mockCaptureError).toHaveBeenCalledTimes(3);
    expect(mockCaptureError.mock.calls[2][0]).toContain('attempt 3/3');
    // KNOWN BUG (documented, not fixed — see task notes): same double-report
    // as the permanent-error case above — createUserWithRetry's own
    // captureCriticalError plus handleMissingDbUser's redundant follow-up.
    expect(mockCaptureCriticalError).toHaveBeenCalledTimes(2);
    expect(mockCaptureCriticalError.mock.calls[0][0]).toContain(
      'after 3 attempts'
    );
    expect(mockCaptureCriticalError.mock.calls[1][0]).toBe(
      'User creation failed after retries'
    );
  });

  it('returns USER_CREATION_FAILED with EMAIL_REQUIRED_FOR_USER_CREATION when no email is available', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_no_email', email: null },
      session: { id: 'sess_no_email' },
    });

    // Only loadAuthGateRecord's select runs — handleMissingDbUser short-circuits
    // on the missing-email check before ever reaching createUserWithRetry.
    mockDbSelect.mockReturnValueOnce(chainLimit([]));

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.USER_CREATION_FAILED);
    expect(result.dbUserId).toBeNull();
    expect(result.redirectTo).toBe('/error/user-creation-failed');
    expect(result.context.errorCode).toBe('EMAIL_REQUIRED_FOR_USER_CREATION');

    // No user-creation attempt is ever made without an email.
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(delaysUsed).toEqual([]);

    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError.mock.calls[0][0]).toBe(
      'Cannot create user without email'
    );
    // Fails closed via captureError (not captureCriticalError) — this is a
    // caller-input problem, not a DB/infra failure.
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Note: For tests using vi.hoisted(), we inline the mock creation.
// For tests that don't need hoisting, use the shared utilities:
// import { createDrizzleMocksHoisted, createTransactionMock } from '../../../test-utils';

// Create hoisted mocks
const mockAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());
const mockDbTransaction = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn());
const mockBuildWaitlistInviteEmail = vi.hoisted(() => vi.fn());
const mockGetWaitlistSettings = vi.hoisted(() => vi.fn());
const mockTryReserveAutoAcceptSlot = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockFinalizeWaitlistApproval = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockApproveWaitlistEntryInTx = vi.hoisted(() => vi.fn());
const mockEnqueueWaitlistEmailJob = vi.hoisted(() => vi.fn());
const mockEnforceOnboardingRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getOptionalAuth: mockAuth,
  getCachedSessionTokenAuth: mockAuth,
  getCachedCurrentUser: mockCurrentUser,
}));

const mockDoesTableExist = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    execute: mockDbExecute,
    transaction: mockDbTransaction,
  },
  doesTableExist: mockDoesTableExist,
  waitlistEntries: {},
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
  waitlistInvites: {},
  creatorProfiles: {},
}));

vi.mock('@/lib/error-tracking', () => ({
  sanitizeErrorResponse: vi.fn((msg, debug, opts) => ({
    error: msg,
    debugMessage: debug,
    ...opts,
  })),
  captureError: vi.fn().mockResolvedValue(undefined),
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

vi.mock('@/lib/waitlist/invite', () => ({
  buildWaitlistInviteEmail: mockBuildWaitlistInviteEmail,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: mockGetWaitlistSettings,
  tryReserveAutoAcceptSlot: mockTryReserveAutoAcceptSlot,
}));

vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueWaitlistEmailJob: mockEnqueueWaitlistEmailJob,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackWaitlist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mockEnforceOnboardingRateLimit,
  getOnboardingRateLimitMessage: (error: unknown) => {
    if (!(error instanceof Error)) return null;
    const prefix = '[RATE_LIMITED] ';
    return error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : null;
  },
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: vi.fn(url => url),
}));

vi.mock('@/lib/utils/social-platform', () => ({
  detectPlatformFromUrl: vi.fn(() => ({
    platform: 'instagram',
    normalizedUrl: 'https://instagram.com/testuser',
  })),
  extractHandleFromUrl: vi.fn(() => 'testuser'),
}));

vi.mock('@/lib/validation/username', () => ({
  normalizeUsername: vi.fn(username => username.toLowerCase()),
  validateUsername: vi.fn(() => ({ isValid: true })),
}));

let routeModulePromise: Promise<typeof import('@/app/api/waitlist/route')>;

// Helper to create a standard transaction mock
// This pattern is also available in test-utils/db/drizzle-query-mock.ts
function createTransactionMock(
  options: { selectResult?: unknown[]; insertReturn?: unknown[] } = {}
) {
  const { selectResult = [], insertReturn = [{ id: 'mock-id' }] } = options;

  return async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    const mockReturning = vi.fn().mockResolvedValue(insertReturn);
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({
      returning: mockReturning,
      onConflictDoUpdate: mockOnConflict,
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: mockReturning,
      }),
    });
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(selectResult),
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const tx = {
      select: vi.fn().mockReturnValue({ from: mockFrom }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    return await callback(tx);
  };
}

// Route module cold-import is heavy on sharded CI workers; first case can exceed
// the default 5s timeout when it also awaits GET/POST.
describe('Waitlist API', { timeout: 20_000 }, () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgres://test@localhost/test';
    routeModulePromise = import('@/app/api/waitlist/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://test@localhost/test';

    // Set up default transaction mock
    mockDbTransaction.mockImplementation(
      createTransactionMock({
        selectResult: [],
        insertReturn: [{ id: 'entry_123' }],
      })
    );

    // Default: no auto-accept slot available
    mockGetWaitlistSettings.mockResolvedValue({
      gateEnabled: true,
      autoAcceptEnabled: false,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 0,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    });
    mockTryReserveAutoAcceptSlot.mockResolvedValue({ shouldAutoAccept: false });
    // Default: approval not granted
    mockApproveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'capacity_full',
    });
    mockDoesTableExist.mockResolvedValue(true);
    mockFinalizeWaitlistApproval.mockResolvedValue(undefined);
    mockCaptureCriticalError.mockResolvedValue(undefined);
    mockEnqueueWaitlistEmailJob.mockResolvedValue('job-1');
    mockEnforceOnboardingRateLimit.mockResolvedValue(undefined);
    mockBuildWaitlistInviteEmail.mockReturnValue({
      message: {
        id: 'waitlist_welcome:profile_auto',
        subject: "You're off the waitlist!",
      },
      target: { email: 'test@example.com' },
      inviteUrl: 'https://example.com/signin',
    });
    mockSendNotification.mockResolvedValue({ delivered: ['email'] });
    // Provide a tx object that delegates to the per-test db mocks so tests that
    // set up mockDbSelect/mockDbInsert/etc. work correctly inside the
    // withSystemIngestionSession callback.
    mockWithSystemIngestionSession.mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          select: mockDbSelect,
          insert: mockDbInsert,
          update: mockDbUpdate,
          execute: mockDbExecute,
        })
    );
  });

  describe('GET /api/waitlist', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.hasEntry).toBe(false);
    });

    it('returns 400 when user has no email', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [],
      });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.hasEntry).toBe(false);
    });

    it('does not fall back when Better Auth user has no primary email', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [],
        primaryEmailAddress: null,
      });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.hasEntry).toBe(false);
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it('returns waitlist entry status for authenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'test@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'test@example.com' },
      });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ id: 'entry_123', status: 'new' }]),
            }),
            limit: vi
              .fn()
              .mockResolvedValue([{ id: 'entry_123', status: 'new' }]),
          }),
        }),
      });

      const { GET } = await routeModulePromise;
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasEntry).toBe(true);
      expect(data.status).toBe('new');
    });
  });

  describe('POST /api/waitlist', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('returns 400 for invalid request body', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'test@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'test@example.com' },
        fullName: 'Test User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'invalid',
          primarySocialUrl: 'not-a-url',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('returns 429 when a waitlist submission is rate limited', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockEnforceOnboardingRateLimit.mockRejectedValue(
        new Error(
          '[RATE_LIMITED] Too many onboarding attempts. Please try again in 1 hour.'
        )
      );

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data).toMatchObject({
        success: false,
        code: 'rate_limited',
        error: 'Too many onboarding attempts. Please try again in 1 hour.',
      });
      expect(mockCurrentUser).not.toHaveBeenCalled();
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it('returns 503 with Retry-After when the waitlist table does not exist', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockDoesTableExist.mockResolvedValue(false);

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(data.success).toBe(false);
      expect(data.code).toBe('waitlist_table_missing');
      expect(mockCurrentUser).not.toHaveBeenCalled();
      expect(mockDbTransaction).not.toHaveBeenCalled();
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('fails closed with 503 when checking waitlist table existence throws', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockDoesTableExist.mockRejectedValue(
        new Error('connection terminated unexpectedly')
      );

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/test',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(data.success).toBe(false);
      expect(data.code).toBe('waitlist_table_missing');
      expect(mockCurrentUser).not.toHaveBeenCalled();
      expect(mockDbTransaction).not.toHaveBeenCalled();
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('rejects submissions when Better Auth user has no primary email', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [],
        primaryEmailAddress: null,
        fullName: 'Unverified User',
      });
      mockDoesTableExist.mockResolvedValue(true);

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/unverified',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.code).toBe('email_unverified');
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it.skip('creates waitlist entry successfully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'test@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'test@example.com' },
        fullName: 'Test User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/testuser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('new');
    });

    it('does not downgrade user status when re-submitting with a claimed entry', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_claimed' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'claimed@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'claimed@example.com' },
        fullName: 'Claimed User',
      });
      mockDbExecute.mockResolvedValue({ rows: [] });

      // Existing entry with status 'claimed' (already approved).
      // The select chain must support both orderBy→limit (findLatestEntryByEmail)
      // and plain limit (upsertUserStatus users lookup).
      const claimedEntry = [{ id: 'entry_claimed', status: 'claimed' }];
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(claimedEntry),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // Track insert calls to verify upsertUserAsPending is NOT called
      const insertValuesCalls: unknown[] = [];
      mockDbInsert.mockReturnValue({
        values: vi.fn((arg: unknown) => {
          insertValuesCalls.push(arg);
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            returning: vi.fn().mockResolvedValue([]),
          };
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/claimeduser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('claimed');

      // upsertUserAsPending should NOT have been called — no insert with waitlist_pending
      const pendingUpsert = insertValuesCalls.find(
        (call: unknown) =>
          typeof call === 'object' &&
          call !== null &&
          'userStatus' in call &&
          (call as Record<string, unknown>).userStatus === 'waitlist_pending'
      );
      expect(pendingUpsert).toBeUndefined();
    });

    it('does not send invite email when open signup approval succeeds', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_auto' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'auto@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'auto@example.com' },
        fullName: 'Auto User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });

      // No existing entry
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Insert entry returns an id
      const mockReturning = vi.fn().mockResolvedValue([{ id: 'entry_auto' }]);
      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
          onConflictDoUpdate: mockOnConflict,
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockGetWaitlistSettings.mockResolvedValueOnce({
        gateEnabled: false,
        autoAcceptEnabled: true,
        autoAcceptAfterDays: 7,
        autoAcceptDailyLimit: 10,
        autoAcceptedToday: 0,
        autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
      });

      // Open signup approval succeeds — approveWaitlistEntryInTx returns approved outcome
      mockApproveWaitlistEntryInTx.mockResolvedValue({
        outcome: 'approved',
        profileId: 'profile_auto',
        email: 'auto@example.com',
        fullName: 'Auto User',
        clerkId: 'clerk_auto',
      });

      // No existing entry; select chain supports both orderBy→limit and plain limit
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/autouser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('approved');
      expect(mockFinalizeWaitlistApproval).toHaveBeenCalled();
      expect(mockTryReserveAutoAcceptSlot).not.toHaveBeenCalled();

      // Open-signup approvals should NOT get the "off the waitlist" email
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    });

    it('does not approve fresh submissions when delayed auto-accept has capacity', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_no_slot' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'noslot@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'noslot@example.com' },
        fullName: 'No Slot User',
      });
      mockDbExecute.mockResolvedValue({ rows: [] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      const mockReturning = vi.fn().mockResolvedValue([{ id: 'entry_noslot' }]);
      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
          onConflictDoUpdate: mockOnConflict,
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockGetWaitlistSettings.mockResolvedValueOnce({
        gateEnabled: true,
        autoAcceptEnabled: true,
        autoAcceptAfterDays: 7,
        autoAcceptDailyLimit: 10,
        autoAcceptedToday: 0,
        autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/noslotuser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('waitlisted');
      expect(mockTryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    });

    it('returns waitlisted status and no email when delayed auto-accept is disabled', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_noapproval' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'noapproval@example.com' }],
        primaryEmailAddress: {
          id: 'e1',
          emailAddress: 'noapproval@example.com',
        },
        fullName: 'No Approval User',
      });
      mockDbExecute.mockResolvedValue({ rows: [] });
      // No existing entry; supports both orderBy→limit and plain limit
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      const mockReturning = vi
        .fn()
        .mockResolvedValue([{ id: 'entry_noapproval' }]);
      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
          onConflictDoUpdate: mockOnConflict,
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/noapprovaluser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('waitlisted');
      expect(mockTryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockFinalizeWaitlistApproval).not.toHaveBeenCalled();
    });

    it.skip('sets users.userStatus to waitlist_pending after submission', async () => {
      // Track calls to verify user status update
      const mockOnConflictCalls: unknown[] = [];
      const mockValuesCalls: unknown[] = [];

      // Set up transaction mock to track calls
      mockDbTransaction.mockImplementation(async callback => {
        const mockOnConflict = vi.fn(arg => {
          mockOnConflictCalls.push(arg);
          return Promise.resolve(undefined);
        });
        const mockReturning = vi.fn().mockResolvedValue([{ id: 'entry_123' }]);
        const mockValues = vi.fn(arg => {
          mockValuesCalls.push(arg);
          return {
            returning: mockReturning,
            onConflictDoUpdate: mockOnConflict,
          };
        });
        const mockWhere = vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        });
        const mockFrom = vi.fn().mockReturnValue({
          where: mockWhere,
        });

        const tx = {
          select: vi.fn().mockReturnValue({
            from: mockFrom,
          }),
          insert: vi.fn().mockReturnValue({
            values: mockValues,
          }),
          update: mockDbUpdate,
          execute: mockDbExecute,
        };
        return await callback(tx);
      });

      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ id: 'e1', emailAddress: 'test@example.com' }],
        primaryEmailAddress: { id: 'e1', emailAddress: 'test@example.com' },
        fullName: 'Test User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { POST } = await routeModulePromise;
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/testuser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify transaction was called
      expect(mockDbTransaction).toHaveBeenCalled();

      // Verify users table was upserted with userStatus='waitlist_pending'
      const userInsertCall = mockValuesCalls.find(
        (call: unknown) =>
          typeof call === 'object' &&
          call !== null &&
          'userStatus' in call &&
          call.userStatus === 'waitlist_pending'
      );

      expect(userInsertCall).toEqual({
        clerkId: 'user_123',
        email: 'test@example.com',
        userStatus: 'waitlist_pending',
      });

      // Verify onConflictDoUpdate was called with correct update
      const onConflictCall = mockOnConflictCalls.find(
        (call: unknown) =>
          typeof call === 'object' &&
          call !== null &&
          'set' in call &&
          typeof call.set === 'object' &&
          call.set !== null &&
          'userStatus' in call.set
      );

      expect(onConflictCall).toEqual(
        expect.objectContaining({
          set: expect.objectContaining({
            userStatus: 'waitlist_pending',
            updatedAt: expect.any(Date),
          }),
        })
      );
    });
  });
});

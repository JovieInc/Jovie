import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockTryReserveAutoAcceptSlot = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockFinalizeWaitlistApproval = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    execute: mockDbExecute,
    transaction: mockDbTransaction,
  },
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
  tryReserveAutoAcceptSlot: mockTryReserveAutoAcceptSlot,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: vi.fn(),
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackWaitlist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: vi.fn().mockResolvedValue(undefined),
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

describe('Waitlist API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://test@localhost/test';

    // Set up default transaction mock
    mockDbTransaction.mockImplementation(
      createTransactionMock({
        selectResult: [],
        insertReturn: [{ id: 'entry_123' }],
      })
    );

    // Default: no auto-accept slot available
    mockTryReserveAutoAcceptSlot.mockResolvedValue({ shouldAutoAccept: false });
    mockFinalizeWaitlistApproval.mockResolvedValue(undefined);
    mockCaptureCriticalError.mockResolvedValue(undefined);
    mockBuildWaitlistInviteEmail.mockReturnValue({
      message: {
        id: 'waitlist_welcome:profile_auto',
        subject: "You're off the waitlist!",
      },
      target: { email: 'test@example.com' },
      inviteUrl: 'https://example.com/signin',
    });
    mockSendNotification.mockResolvedValue({ delivered: ['email'] });
    mockWithSystemIngestionSession.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn({})
    );
  });

  describe('GET /api/waitlist', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/waitlist/route');
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

      const { GET } = await import('@/app/api/waitlist/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.hasEntry).toBe(false);
    });

    it('returns waitlist entry status for authenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi
              .fn()
              .mockResolvedValue([{ id: 'entry_123', status: 'new' }]),
          }),
        }),
      });

      const { GET } = await import('@/app/api/waitlist/route');
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

      const { POST } = await import('@/app/api/waitlist/route');
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
        emailAddresses: [{ emailAddress: 'test@example.com' }],
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

      const { POST } = await import('@/app/api/waitlist/route');
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

    it.skip('creates waitlist entry successfully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
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

      const { POST } = await import('@/app/api/waitlist/route');
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

    it('does not send welcome email when auto-approval succeeds (user bypassed waitlist)', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_auto' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'auto@example.com' }],
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
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // Auto-accept slot available
      mockTryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: true,
      });

      // Approval succeeds
      mockWithSystemIngestionSession.mockResolvedValue({
        outcome: 'approved',
        profileId: 'profile_auto',
        email: 'auto@example.com',
        fullName: 'Auto User',
        clerkId: 'clerk_auto',
      });

      const { POST } = await import('@/app/api/waitlist/route');
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
      expect(data.status).toBe('claimed');
      expect(mockFinalizeWaitlistApproval).toHaveBeenCalled();

      // Auto-approved users should NOT get the "off the waitlist" email
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    });

    it('does not send welcome email when auto-approval slot is not available', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_no_slot' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'noslot@example.com' }],
        fullName: 'No Slot User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
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
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // No auto-accept slot
      mockTryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: false,
      });

      const { POST } = await import('@/app/api/waitlist/route');
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
      expect(data.status).toBe('new');
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockBuildWaitlistInviteEmail).not.toHaveBeenCalled();
    });

    it('captures critical error and returns new status when auto-approval yields no_profile', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_noprofile' });
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'noprofile@example.com' }],
        fullName: 'No Profile User',
      });
      mockDbExecute.mockResolvedValue({ rows: [{ table_exists: true }] });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      const mockReturning = vi
        .fn()
        .mockResolvedValue([{ id: 'entry_noprofile' }]);
      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
          onConflictDoUpdate: mockOnConflict,
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockTryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: true,
      });
      mockWithSystemIngestionSession.mockResolvedValue({
        outcome: 'no_profile',
      });

      const { POST } = await import('@/app/api/waitlist/route');
      const request = new Request('http://localhost/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal: 'streams',
          primarySocialUrl: 'https://instagram.com/noprofileuser',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('new');
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        expect.stringContaining('no_profile'),
        expect.any(Error),
        expect.any(Object)
      );
      expect(mockSendNotification).not.toHaveBeenCalled();
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
        emailAddresses: [{ emailAddress: 'test@example.com' }],
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

      const { POST } = await import('@/app/api/waitlist/route');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks: the module under test pulls in server-only DB modules at
// import time; we replace the boundary collaborators here so the unit test
// can exercise the orchestration logic of `submitWaitlistAccessRequest`
// without touching a real database.

const findLatestEntryByEmail = vi.fn();
const getWaitlistSettings = vi.fn();
const tryReserveAutoAcceptSlot = vi.fn();
const approveWaitlistEntryInTx = vi.fn();
const finalizeWaitlistApproval = vi.fn().mockResolvedValue(undefined);
const invalidateProxyUserStateCache = vi.fn().mockResolvedValue(undefined);
const notifySlackWaitlist = vi.fn().mockResolvedValue(undefined);

// Track tx mutations to assert against
let userRow: { id: string; userStatus: string } | null = null;
const insertedEntries: Array<Record<string, unknown>> = [];
const updatedRows: Array<Record<string, unknown>> = [];
let waitlistInsertReturnRows: Array<{ id: string }> = [{ id: 'entry-new' }];

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: (...args: unknown[]) =>
    invalidateProxyUserStateCache(...args),
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackWaitlist: (...args: unknown[]) => notifySlackWaitlist(...args),
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: (...args: unknown[]) =>
    approveWaitlistEntryInTx(...args),
  finalizeWaitlistApproval: (...args: unknown[]) =>
    finalizeWaitlistApproval(...args),
}));

vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: (...args: unknown[]) => getWaitlistSettings(...args),
  tryReserveAutoAcceptSlot: (...args: unknown[]) =>
    tryReserveAutoAcceptSlot(...args),
}));

vi.mock('@/lib/utils/social-platform', () => ({
  detectPlatformFromUrl: () => ({
    platform: 'instagram',
    normalizedUrl: 'https://instagram.com/x',
  }),
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: (e: string) => e.toLowerCase().trim(),
}));

// Mock the ingestion session wrapper to invoke the operation with a tx
// stub that the test can shape.
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: async (
    operation: (tx: unknown) => Promise<unknown>
  ) => {
    const tx = createTxMock();
    return operation(tx);
  },
}));

function createTxMock() {
  const execute = vi.fn().mockResolvedValue(undefined);

  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => {
        // users select-by-clerkId resolves through `.limit(1)`
        const obj = {
          orderBy: vi.fn(() => ({
            limit: vi
              .fn()
              .mockImplementation(() =>
                Promise.resolve(findLatestEntryByEmail(table))
              ),
          })),
          limit: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(userRow ? [userRow] : [])
            ),
        };
        return obj;
      }),
    })),
  }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(values => {
    if (values && typeof values === 'object') {
      updatedRows.push(values as Record<string, unknown>);
    }
    if (
      values &&
      typeof values === 'object' &&
      'userStatus' in values &&
      userRow
    ) {
      userRow = {
        ...userRow,
        userStatus: (values as { userStatus: string }).userStatus,
      };
    }
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      insertedEntries.push({ table, vals });
      if (
        vals &&
        typeof vals === 'object' &&
        'clerkId' in vals &&
        'userStatus' in vals
      ) {
        userRow = {
          id: 'user-new',
          userStatus: String(vals.userStatus),
        };
        return Promise.resolve(undefined);
      }
      const isEmailJob = 'jobType' in vals;
      const returning = vi
        .fn()
        .mockResolvedValue(
          isEmailJob ? [{ id: 'job-1' }] : waitlistInsertReturnRows
        );
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning,
        })),
        returning,
      };
    }),
  }));

  return { execute, select, update, insert };
}

const baseInput = {
  clerkUserId: 'clerk_123',
  email: 'Creator@Example.com',
  fullName: 'Test Creator',
  data: {
    primaryGoal: 'launch',
    primarySocialUrl: 'https://instagram.com/x',
    spotifyUrl: undefined,
    spotifyArtistName: undefined,
    heardAbout: undefined,
    selectedPlan: undefined,
  } as never,
};

describe('submitWaitlistAccessRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRow = null;
    insertedEntries.length = 0;
    updatedRows.length = 0;
    waitlistInsertReturnRows = [{ id: 'entry-new' }];
    findLatestEntryByEmail.mockReset();
    findLatestEntryByEmail.mockReturnValue([]);
    getWaitlistSettings.mockReset();
    getWaitlistSettings.mockResolvedValue({
      gateEnabled: true,
      autoAcceptEnabled: false,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 0,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    });
    tryReserveAutoAcceptSlot.mockReset();
    approveWaitlistEntryInTx.mockReset();
    finalizeWaitlistApproval.mockClear();
    invalidateProxyUserStateCache.mockClear();
    notifySlackWaitlist.mockClear();
  });

  it('does NOT downgrade an active user when re-running the waitlist flow', async () => {
    userRow = { id: 'user-1', userStatus: 'active' };
    findLatestEntryByEmail.mockReturnValueOnce([
      { id: 'entry-1', status: 'claimed' },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_accepted');
    // userStatus must still be 'active' — not 'waitlist_approved'
    expect(userRow?.userStatus).toBe('active');
    // Slack must NOT fire on already_accepted
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
    // Cache must NOT be busted because status didn't change
    expect(invalidateProxyUserStateCache).not.toHaveBeenCalled();
  });

  it('busts proxy-state cache on already_accepted only when status genuinely changes', async () => {
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      { id: 'entry-1', status: 'claimed' },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_accepted');
    expect(userRow?.userStatus).toBe('waitlist_approved');
    expect(invalidateProxyUserStateCache).toHaveBeenCalledTimes(1);
    expect(invalidateProxyUserStateCache).toHaveBeenCalledWith('clerk_123');
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it('fires Slack exactly once on first-time waitlisted_gate_on signup', async () => {
    findLatestEntryByEmail.mockReturnValueOnce([]); // no existing entry
    tryReserveAutoAcceptSlot.mockResolvedValue({
      shouldAutoAccept: false,
      reason: 'gate_on',
    });

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('waitlisted_gate_on');
    expect(notifySlackWaitlist).toHaveBeenCalledTimes(1);
  });

  it('handles canonical email insert races as idempotent waitlist submissions', async () => {
    waitlistInsertReturnRows = [];
    findLatestEntryByEmail
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { id: 'entry-race-winner', status: 'new', waitlistedAt: null },
      ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result).toMatchObject({
      entryId: 'entry-race-winner',
      status: 'waitlisted',
      outcome: 'already_waitlisted',
    });
    expect(
      updatedRows.find(row => row.statusReason === 'already_waitlisted')?.status
    ).toBe('waitlisted');
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it('does NOT fire Slack on idempotent re-assert when status is already pinned', async () => {
    // already-claimed entry + active user => already_accepted, no status change
    userRow = { id: 'user-1', userStatus: 'active' };
    findLatestEntryByEmail.mockReturnValue([
      { id: 'entry-1', status: 'claimed' },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    await submitWaitlistAccessRequest(baseInput);
    await submitWaitlistAccessRequest(baseInput);

    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it('does NOT fire Slack on already_waitlisted (returning user, existing pending entry)', async () => {
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      { id: 'entry-1', status: 'new' },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_waitlisted');
    expect(result.status).toBe('waitlisted');
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it('preserves original waitlist age when a pending user resubmits', async () => {
    const originalWaitlistedAt = new Date('2026-04-01T00:00:00.000Z');
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      {
        id: 'entry-1',
        status: 'waitlisted',
        waitlistedAt: originalWaitlistedAt,
      },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_waitlisted');
    expect(
      updatedRows.find(row => row.statusReason === 'already_waitlisted')
        ?.waitlistedAt
    ).toBe(originalWaitlistedAt);
  });

  it('fills waitlist age when a legacy pending row is missing it', async () => {
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      {
        id: 'entry-1',
        status: 'new',
        waitlistedAt: null,
      },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_waitlisted');
    expect(
      updatedRows.find(row => row.statusReason === 'already_waitlisted')
        ?.waitlistedAt
    ).toBeInstanceOf(Date);
  });

  it('requeues an expired waitlist row when the user resubmits', async () => {
    const originalWaitlistedAt = new Date('2026-04-01T00:00:00.000Z');
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      {
        id: 'entry-1',
        status: 'expired',
        waitlistedAt: originalWaitlistedAt,
      },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('already_waitlisted');
    expect(result.status).toBe('waitlisted');
    expect(
      updatedRows.find(row => row.statusReason === 'already_waitlisted')?.status
    ).toBe('waitlisted');
    expect(
      updatedRows.find(row => row.statusReason === 'already_waitlisted')
        ?.waitlistedAt
    ).toBe(originalWaitlistedAt);
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });
});

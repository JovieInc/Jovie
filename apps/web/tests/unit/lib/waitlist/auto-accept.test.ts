import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockGetWaitlistSettings,
  mockTryReserveAutoAcceptSlot,
  mockApproveWaitlistEntryInTx,
  mockFinalizeWaitlistApproval,
  mockEnqueueWaitlistApprovalInviteEmail,
  mockWithSerializableRetry,
  mockWithSystemIngestionSession,
  mockLoggerWarn,
  mockEq,
  mockInArray,
  mockLte,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockGetWaitlistSettings: vi.fn(),
  mockTryReserveAutoAcceptSlot: vi.fn(),
  mockApproveWaitlistEntryInTx: vi.fn(),
  mockFinalizeWaitlistApproval: vi.fn(),
  mockEnqueueWaitlistApprovalInviteEmail: vi.fn(),
  mockWithSerializableRetry: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockEq: vi.fn((_column: unknown, value: unknown) => ({ op: 'eq', value })),
  mockInArray: vi.fn((_column: unknown, values: readonly unknown[]) => ({
    op: 'inArray',
    values,
  })),
  mockLte: vi.fn((_column: unknown, value: unknown) => ({ op: 'lte', value })),
}));

type CandidateRow = {
  id: string;
  email: string;
  status: 'new' | 'waitlisted' | 'invited';
};

let candidateRows: CandidateRow[] = [];
let suppressionRows: Array<{ emailHash: string }> = [];
let userRows: Array<{ email: string; userStatus: string }> = [];
let lastCandidateLimit: number | null = null;

const hashEmailForTest = (email: string) =>
  `hash:${email.trim().toLowerCase()}`;

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    email: 'users.email',
    userStatus: 'users.user_status',
  },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  emailSuppressions: {
    emailHash: 'email_suppressions.email_hash',
    expiresAt: 'email_suppressions.expires_at',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {
    id: 'waitlist_entries.id',
    email: 'waitlist_entries.email',
    status: 'waitlist_entries.status',
    canonical: 'waitlist_entries.canonical',
    waitlistedAt: 'waitlist_entries.waitlisted_at',
    createdAt: 'waitlist_entries.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  asc: vi.fn((column: unknown) => ({ op: 'asc', column })),
  eq: mockEq,
  gt: vi.fn((_column: unknown, value: unknown) => ({ op: 'gt', value })),
  inArray: mockInArray,
  isNull: vi.fn((column: unknown) => ({ op: 'isNull', column })),
  lte: mockLte,
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  sql: vi.fn(),
}));

vi.mock('@/lib/notifications/suppression', () => ({
  hashEmail: hashEmailForTest,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}));

vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings: mockGetWaitlistSettings,
  tryReserveAutoAcceptSlot: mockTryReserveAutoAcceptSlot,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/waitlist/email-jobs', () => ({
  enqueueWaitlistApprovalInviteEmail: mockEnqueueWaitlistApprovalInviteEmail,
}));

vi.mock('@/lib/db/serializable-retry', () => ({
  withSerializableRetry: mockWithSerializableRetry,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

function createCandidateQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async (limit: number) => {
            lastCandidateLimit = limit;
            return candidateRows.slice(0, limit);
          }),
        })),
      })),
    })),
  };
}

function createRowsQuery<T>(rows: T[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(async () => rows),
    })),
  };
}

function createTxMock() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: { value?: unknown }) => ({
          for: vi.fn(() => ({
            limit: vi.fn(async () => {
              const candidate = candidateRows.find(
                row => row.id === condition.value
              );
              return candidate
                ? [{ id: candidate.id, status: candidate.status }]
                : [];
            }),
          })),
        })),
      })),
    })),
  };
}

describe('runWaitlistAutoAccept', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    candidateRows = [];
    suppressionRows = [];
    userRows = [];
    lastCandidateLimit = null;

    mockGetWaitlistSettings.mockResolvedValue({
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 0,
    });
    mockTryReserveAutoAcceptSlot.mockResolvedValue({
      shouldAutoAccept: true,
      reason: 'reserved',
    });
    mockApproveWaitlistEntryInTx.mockImplementation(
      async (_tx: unknown, entryId: string) => ({
        outcome: 'approved',
        entryId,
        profileId: null,
        email: `${entryId}@example.com`,
        fullName: 'Creator',
        clerkId: 'clerk_123',
      })
    );
    mockFinalizeWaitlistApproval.mockResolvedValue(undefined);
    mockEnqueueWaitlistApprovalInviteEmail.mockResolvedValue(undefined);
    mockWithSerializableRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => operation()
    );
    mockWithSystemIngestionSession.mockImplementation(
      async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(createTxMock())
    );
    mockDbSelect.mockImplementation((projection: Record<string, unknown>) => {
      if ('emailHash' in projection) {
        return createRowsQuery(suppressionRows);
      }
      if ('userStatus' in projection) {
        return createRowsQuery(userRows);
      }
      return createCandidateQuery();
    });
  });

  it('includes migrated legacy waitlist rows still stored with new status', async () => {
    candidateRows = [
      { id: 'legacy-entry', email: 'legacy@example.com', status: 'new' },
    ];

    const { runWaitlistAutoAccept } = await import(
      '@/lib/waitlist/auto-accept'
    );
    const result = await runWaitlistAutoAccept({
      now: new Date('2026-05-09T00:00:00Z'),
    });

    expect(result).toMatchObject({ scanned: 1, approved: 1, skipped: 0 });
    expect(mockInArray).toHaveBeenCalledWith('waitlist_entries.status', [
      'new',
      'waitlisted',
    ]);
    expect(mockApproveWaitlistEntryInTx).toHaveBeenCalledWith(
      expect.anything(),
      'legacy-entry',
      expect.objectContaining({
        actorType: 'job',
        reason: 'auto_accept_after_days',
        targetStatus: 'invited',
      })
    );
    expect(mockEnqueueWaitlistApprovalInviteEmail).toHaveBeenCalledWith(
      expect.anything(),
      'legacy-entry',
      expect.objectContaining({ now: new Date('2026-05-09T00:00:00Z') })
    );
  });

  it('keeps scanning past suppressed rows until valid candidates can use capacity', async () => {
    candidateRows = [
      {
        id: 'suppressed-1',
        email: 'suppressed-1@example.com',
        status: 'waitlisted',
      },
      {
        id: 'suppressed-2',
        email: 'suppressed-2@example.com',
        status: 'waitlisted',
      },
      {
        id: 'suppressed-3',
        email: 'suppressed-3@example.com',
        status: 'waitlisted',
      },
      {
        id: 'suppressed-4',
        email: 'suppressed-4@example.com',
        status: 'waitlisted',
      },
      {
        id: 'suppressed-5',
        email: 'suppressed-5@example.com',
        status: 'waitlisted',
      },
      { id: 'valid-1', email: 'valid-1@example.com', status: 'waitlisted' },
    ];
    suppressionRows = candidateRows.slice(0, 5).map(row => ({
      emailHash: hashEmailForTest(row.email),
    }));

    const { runWaitlistAutoAccept } = await import(
      '@/lib/waitlist/auto-accept'
    );
    const result = await runWaitlistAutoAccept({
      now: new Date('2026-05-09T00:00:00Z'),
    });

    expect(lastCandidateLimit).toBe(10_000);
    expect(result).toMatchObject({ scanned: 6, approved: 1, skipped: 5 });
    expect(mockTryReserveAutoAcceptSlot).toHaveBeenCalledTimes(1);
    expect(mockApproveWaitlistEntryInTx).toHaveBeenCalledWith(
      expect.anything(),
      'valid-1',
      expect.anything()
    );
  });
});

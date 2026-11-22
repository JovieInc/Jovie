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
  mockIsNotNull,
  mockCountOpenCohortLearnings,
  mockReadCachedAcquisitionEligibility,
} = vi.hoisted(() => ({
  mockReadCachedAcquisitionEligibility: vi.fn(),
  mockIsNotNull: vi.fn((column: unknown) => ({ op: 'isNotNull', column })),
  mockCountOpenCohortLearnings: vi.fn(),
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
let transactionUserRows: Array<{ id: string; userStatus: string }> | null =
  null;
let _lastCandidateLimit: number | null = null;

const hashEmailForTest = (email: string) =>
  `hash:${email.trim().toLowerCase()}`;

vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: mockReadCachedAcquisitionEligibility,
}));

vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { email: 'users.email', userStatus: 'users.user_status' },
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
    spotifyUrl: 'waitlist_entries.spotify_url',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  asc: vi.fn((column: unknown) => ({ op: 'asc', column })),
  eq: mockEq,
  gt: vi.fn((_column: unknown, value: unknown) => ({ op: 'gt', value })),
  inArray: mockInArray,
  isNotNull: mockIsNotNull,
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

vi.mock('@/lib/waitlist/support-load.server', () => ({
  readSupportLoadCapacity: async (s: { autoAcceptDailyLimit: number }) => ({
    dailyLimit: s.autoAcceptDailyLimit,
    remaining: s.autoAcceptDailyLimit,
  }),
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/waitlist/cohort-learnings', () => ({
  MAX_OPEN_COHORT_LEARNINGS: 10,
  countOpenCohortLearnings: mockCountOpenCohortLearnings,
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
            _lastCandidateLimit = limit;
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
    select: vi.fn((projection: Record<string, unknown>) => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: { value?: unknown }) => ({
          for: vi.fn(() => ({
            limit: vi.fn(async () => {
              if ('userStatus' in projection) {
                return (
                  transactionUserRows ?? [
                    { id: 'user-1', userStatus: 'waitlist_pending' },
                  ]
                );
              }

              const candidate = candidateRows.find(
                row => row.id === condition.value
              );
              return candidate
                ? [
                    {
                      id: candidate.id,
                      email: candidate.email,
                      status: candidate.status,
                    },
                  ]
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
    vi.unstubAllEnvs();
    candidateRows = [];
    suppressionRows = [];
    userRows = [];
    transactionUserRows = null;
    _lastCandidateLimit = null;

    mockGetWaitlistSettings.mockResolvedValue({
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 0,
    });
    mockCountOpenCohortLearnings.mockResolvedValue(0);
    mockReadCachedAcquisitionEligibility.mockReset();
    mockReadCachedAcquisitionEligibility.mockResolvedValue({
      eligible: true,
      verdict: 'ELIGIBLE',
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

  it('rechecks cohort learnings after a serialization conflict before retrying an admission', async () => {
    candidateRows = [
      { id: 'artist', email: 'artist@example.com', status: 'waitlisted' },
    ];
    mockCountOpenCohortLearnings
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(null);
    mockWithSystemIngestionSession.mockRejectedValueOnce(
      Object.assign(new Error('serialization conflict'), { code: '40001' })
    );
    mockWithSerializableRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => {
        try {
          return await operation();
        } catch {
          return operation();
        }
      }
    );
    const { runWaitlistAutoAccept } = await import(
      '@/lib/waitlist/auto-accept'
    );
    const result = await runWaitlistAutoAccept();
    expect(result).toMatchObject({
      approved: 0,
      pausedReason: 'learnings_unavailable',
    });
    expect(mockWithSystemIngestionSession).toHaveBeenCalledTimes(1);
    expect(mockCountOpenCohortLearnings).toHaveBeenCalledTimes(2);
    expect(mockTryReserveAutoAcceptSlot).not.toHaveBeenCalled();
    expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
    expect(mockEnqueueWaitlistApprovalInviteEmail).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockGetWaitlistSettings,
  mockTryReserveAutoAcceptSlot,
  mockApproveWaitlistEntryInTx,
  mockFinalizeWaitlistApproval,
  mockEnqueueWaitlistApprovalInviteEmail,
  mockWithSystemIngestionSession,
  mockCountOpenCohortLearnings,
  mockReadCachedAcquisitionEligibility,
} = vi.hoisted(() => ({
  mockReadCachedAcquisitionEligibility: vi.fn(),
  mockCountOpenCohortLearnings: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetWaitlistSettings: vi.fn(),
  mockTryReserveAutoAcceptSlot: vi.fn(),
  mockApproveWaitlistEntryInTx: vi.fn(),
  mockFinalizeWaitlistApproval: vi.fn(),
  mockEnqueueWaitlistApprovalInviteEmail: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
}));

type CandidateRow = {
  id: string;
  email: string;
  status: 'new' | 'waitlisted' | 'invited';
};

let candidateRows: CandidateRow[] = [];

vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility: mockReadCachedAcquisitionEligibility,
}));
vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));
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
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

function createCandidateQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => candidateRows),
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
        where: vi.fn(() => ({
          for: vi.fn(() => ({
            limit: vi.fn(async () => {
              if ('userStatus' in projection) {
                return [{ id: 'user-1', userStatus: 'waitlist_pending' }];
              }
              const candidate = candidateRows[0];
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

describe('runWaitlistAutoAccept evidence retry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    candidateRows = [];
    mockGetWaitlistSettings.mockResolvedValue({
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 0,
    });
    mockCountOpenCohortLearnings.mockResolvedValue(0);
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
    mockWithSystemIngestionSession.mockImplementation(
      async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(createTxMock())
    );
    mockDbSelect.mockImplementation((projection: Record<string, unknown>) => {
      if ('emailHash' in projection || 'userStatus' in projection) {
        return createRowsQuery([]);
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

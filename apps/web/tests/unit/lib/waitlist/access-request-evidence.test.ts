import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as acquisitionStages from '@/lib/waitlist/acquisition-stages';
import * as cohortLearnings from '@/lib/waitlist/cohort-learnings';

const readCachedAcquisitionEligibility = vi.fn();
const withSystemIngestionSession = vi.fn();
const findLatestEntryByEmail = vi.fn();
const getWaitlistSettings = vi.fn();
const tryReserveAutoAcceptSlot = vi.fn();
const releaseAutoAcceptSlot = vi.fn().mockResolvedValue(undefined);
const approveWaitlistEntryInTx = vi.fn();
const finalizeWaitlistApproval = vi.fn().mockResolvedValue(undefined);
const invalidateProxyUserStateCache = vi.fn().mockResolvedValue(undefined);
const notifySlackWaitlist = vi.fn().mockResolvedValue(undefined);

// Track tx mutations to assert against
let userRow: { id: string; userStatus: string } | null = null;
const insertedEntries: Array<Record<string, unknown>> = [];
const updatedRows: Array<Record<string, unknown>> = [];
let waitlistInsertReturnRows: Array<{ id: string }> = [{ id: 'entry-new' }];
let executeRows: Array<Record<string, unknown>> = [];
const executedSql: string[] = [];

vi.mock('@/lib/acquisition/eligibility.server', () => ({
  readCachedAcquisitionEligibility,
}));

const countOpenCohortLearnings = vi.spyOn(
  cohortLearnings,
  'countOpenCohortLearnings'
);
const recordWaitlistJoin = vi.spyOn(acquisitionStages, 'recordWaitlistJoin');

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackWaitlist,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  getWaitlistSettings,
  tryReserveAutoAcceptSlot,
  releaseAutoAcceptSlot,
}));

vi.mock('@/lib/utils/social-platform', () => ({
  detectPlatformFromUrl: () => ({
    platform: 'instagram',
    normalizedUrl: 'https://instagram.com/x',
  }),
}));

vi.mock('@/lib/utils/email', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/utils/email')>();
  return {
    ...actual,
    normalizeEmail: (e: string) => e.toLowerCase().trim(),
  };
});

// Mock the ingestion session wrapper to invoke the operation with a tx
// stub that the test can shape.
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession,
}));

function createTxMock() {
  const execute = vi.fn(async (query?: unknown) => {
    executedSql.push(
      JSON.stringify(
        (query as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? []
      )
    );
    return executeRows;
  });

  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => {
        // users select-by-app-id resolves through `.limit(1)`
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

  // `.where()` is awaited directly, or chained into `.returning()` when the
  // chat qualifies an existing sign-up entry.
  const updateWhere = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([{ id: 'entry-signup' }]),
    })
  );
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
  appUserId: '3a53ba3e-150c-4ab5-8e73-2d2499764e2c',
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

// Cold import of access-request pulls email-jobs / notifications graph (~5–7s
// on CI shards). Raise describe timeout so the first case can pay that cost.
describe('submitWaitlistAccessRequest evidence', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    userRow = {
      id: baseInput.appUserId,
      userStatus: 'waitlist_pending',
    };
    insertedEntries.length = 0;
    updatedRows.length = 0;
    waitlistInsertReturnRows = [{ id: 'entry-new' }];
    executeRows = [];
    executedSql.length = 0;
    readCachedAcquisitionEligibility.mockReset();
    readCachedAcquisitionEligibility.mockResolvedValue({
      eligible: true,
      verdict: 'ELIGIBLE',
    });
    withSystemIngestionSession.mockReset();
    withSystemIngestionSession.mockImplementation(
      async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(createTxMock())
    );
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
    releaseAutoAcceptSlot.mockReset();
    approveWaitlistEntryInTx.mockReset();
    finalizeWaitlistApproval.mockClear();
    invalidateProxyUserStateCache.mockClear();
    notifySlackWaitlist.mockClear();
  });

  beforeEach(() => {
    countOpenCohortLearnings.mockReset();
    countOpenCohortLearnings.mockResolvedValue(0);
    recordWaitlistJoin.mockClear();
  });

  it.each([null, 10])(
    'holds a positive decision when cohort learnings are %j',
    async openLearnings => {
      countOpenCohortLearnings.mockImplementation(async () => openLearnings);
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: { admit: true, reason: 'admit_resolved_artist' },
        interviewResponses: {
          currentWorkflow: 'I am an artist releasing an album',
          biggestBlocker: 'I cannot get my release links out to my fans',
        },
      });
      expect(result.status).toBe('waitlisted');
      expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
      expect(notifySlackWaitlist).not.toHaveBeenCalled();
      expect(recordWaitlistJoin).not.toHaveBeenCalled();
      expect(
        updatedRows.find(row => {
          const q = row.qualificationResult as
            | { details?: { goldenPathHold?: string } }
            | undefined;
          return q?.details?.goldenPathHold === 'hold_open_learnings';
        })
      ).toBeTruthy();
    }
  );

  it('records an admitted join only after a reserved approval', async () => {
    getWaitlistSettings.mockResolvedValue({
      gateEnabled: true,
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 1,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    });
    tryReserveAutoAcceptSlot.mockResolvedValue({
      shouldAutoAccept: true,
      reason: 'reserved',
    });
    approveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry-new',
      profileId: null,
      email: 'creator@example.com',
      fullName: 'Test Creator',
      clerkId: null,
    });
    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest({
      ...baseInput,
      goldenPathAdmission: { admit: true, reason: 'admit_resolved_artist' },
    });
    expect(result.outcome).toBe('accepted');
    expect(recordWaitlistJoin).toHaveBeenCalledWith(
      expect.objectContaining({ admitted: true })
    );
    expect(notifySlackWaitlist).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks: the module under test pulls in server-only DB modules at
// import time; we replace the boundary collaborators here so the unit test
// can exercise the orchestration logic of `submitWaitlistAccessRequest`
// without touching a real database.

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
  readCachedAcquisitionEligibility: (...args: unknown[]) =>
    readCachedAcquisitionEligibility(...args),
}));

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
  releaseAutoAcceptSlot: (...args: unknown[]) => releaseAutoAcceptSlot(...args),
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
  withSystemIngestionSession: (...args: unknown[]) =>
    withSystemIngestionSession(...args),
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
describe('submitWaitlistAccessRequest', { timeout: 20_000 }, () => {
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

  it('does NOT downgrade an active user when re-running the waitlist flow', async () => {
    userRow = { id: 'user-1', userStatus: 'active' };
    findLatestEntryByEmail.mockReturnValueOnce([
      { id: 'entry-1', status: 'claimed' },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    readCachedAcquisitionEligibility.mockResolvedValue(null);
    const result = await submitWaitlistAccessRequest({
      ...baseInput,
      goldenPathAdmission: { admit: true, reason: 'admit_resolved_artist' },
    });

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
    expect(invalidateProxyUserStateCache).toHaveBeenCalledWith(
      baseInput.appUserId
    );
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  describe('golden-path admission', () => {
    const admit = { admit: true, reason: 'admit_resolved_artist' } as const;

    it.each([
      undefined,
      { admit: false, reason: 'hold_golden_path_not_green' } as const,
    ])(
      'holds a strong interview without reserving or approving when readiness is %j',
      async goldenPathAdmission => {
        const { submitWaitlistAccessRequest } = await import(
          '@/lib/waitlist/access-request'
        );
        const result = await submitWaitlistAccessRequest({
          ...baseInput,
          data: {
            primaryGoal: 'streams',
            primarySocialUrl: 'https://instagram.com/x',
            spotifyUrl: 'https://open.spotify.com/artist/test',
            spotifyArtistName: 'Test Artist',
            heardAbout: undefined,
            selectedPlan: undefined,
          },
          goldenPathAdmission,
          interviewResponses: {
            currentWorkflow: 'I am an artist releasing an album',
            biggestBlocker: 'I cannot get my release links out to my fans',
          },
        });
        expect(result.status).toBe('waitlisted');
        expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
        expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
        expect(finalizeWaitlistApproval).not.toHaveBeenCalled();
      }
    );

    it('holds a previously positive decision when the readiness read fails', async () => {
      readCachedAcquisitionEligibility.mockRejectedValue(
        new Error('redis unavailable')
      );
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: admit,
      });
      expect(result.status).toBe('waitlisted');
      expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
    });

    it('rechecks a positive decision when a serialization retry follows readiness revocation', async () => {
      readCachedAcquisitionEligibility
        .mockResolvedValueOnce({ eligible: true, verdict: 'ELIGIBLE' })
        .mockResolvedValue(null);
      withSystemIngestionSession.mockRejectedValueOnce(
        Object.assign(new Error('serialization conflict'), { code: '40001' })
      );
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
        goldenPathAdmission: admit,
      });
      expect(result.status).toBe('waitlisted');
      expect(withSystemIngestionSession).toHaveBeenCalledTimes(2);
      expect(readCachedAcquisitionEligibility).toHaveBeenCalledTimes(2);
      expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
      expect(finalizeWaitlistApproval).not.toHaveBeenCalled();
    });

    it.each(['reserved', 'capacity_full'] as const)(
      'reserves the same bounded capacity for a high-scoring interview: %s',
      async reservationReason => {
        tryReserveAutoAcceptSlot.mockResolvedValue({
          shouldAutoAccept: reservationReason === 'reserved',
          reason: reservationReason,
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
          data: {
            primaryGoal: 'streams',
            primarySocialUrl: 'https://instagram.com/x',
            spotifyUrl: 'https://open.spotify.com/artist/test',
            spotifyArtistName: 'Test Artist',
            heardAbout: undefined,
            selectedPlan: undefined,
          },
          goldenPathAdmission: admit,
          interviewResponses: {
            currentWorkflow: 'I am an artist releasing an album',
            biggestBlocker: 'I cannot get my release links out to my fans',
          },
        });
        expect(tryReserveAutoAcceptSlot).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(
          reservationReason === 'reserved' ? 'approved' : 'waitlisted'
        );
        if (reservationReason === 'capacity_full') {
          expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
        }
      }
    );

    it('admits a resolved artist when capacity reserves, recording the reason and sending nothing', async () => {
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
        goldenPathAdmission: admit,
      });

      expect(result.outcome).toBe('accepted');
      expect(result.status).toBe('approved');
      expect(tryReserveAutoAcceptSlot).toHaveBeenCalledTimes(1);
      expect(approveWaitlistEntryInTx).toHaveBeenCalledWith(
        expect.anything(),
        'entry-new',
        expect.objectContaining({
          reason: 'qualified_golden_path_resolved_artist',
          targetStatus: 'approved',
        })
      );
      // Admission state only: no confirmation or invite email job.
      expect(
        insertedEntries.some(row => 'jobType' in (row.vals as object))
      ).toBe(false);
    });

    it('holds with capacity_full when the daily slot cannot be reserved', async () => {
      tryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: false,
        reason: 'capacity_full',
      });
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: admit,
      });

      expect(result.status).toBe('waitlisted');
      expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
      expect(
        updatedRows.find(row => row.statusReason === 'waitlist_capacity_full')
      ).toBeTruthy();
    });

    it('gives the slot back when the approval it was reserved for fails', async () => {
      tryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: true,
        reason: 'reserved',
      });
      approveWaitlistEntryInTx.mockResolvedValue({ outcome: 'no_user' });
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: admit,
      });

      expect(result.status).toBe('waitlisted');
      expect(releaseAutoAcceptSlot).toHaveBeenCalledTimes(1);
    });

    it('records auto_accept_disabled as its own hold reason', async () => {
      tryReserveAutoAcceptSlot.mockResolvedValue({
        shouldAutoAccept: false,
        reason: 'auto_accept_disabled',
      });
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: admit,
      });

      expect(
        updatedRows.find(row => {
          const q = row.qualificationResult as
            | { details?: { goldenPathHold?: string } }
            | undefined;
          return q?.details?.goldenPathHold === 'hold_auto_accept_disabled';
        })
      ).toBeTruthy();
      expect(releaseAutoAcceptSlot).not.toHaveBeenCalled();
    });

    it('holds an admit that pending entrants outrank, without reserving', async () => {
      getWaitlistSettings.mockResolvedValue({
        gateEnabled: true,
        autoAcceptEnabled: true,
        autoAcceptAfterDays: 1,
        autoAcceptDailyLimit: 2,
        autoAcceptedToday: 0,
        autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
      });
      executeRows = [{ score: '90' }, { score: '80' }];
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const { scoreAdmissionCandidate } = await import(
        '@/lib/waitlist/admission-score'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: admit,
        admissionScore: scoreAdmissionCandidate({
          identityResolved: true,
          followers: 800,
          popularity: 5,
          catalogReleases: null,
          latestReleaseAt: null,
          releaseStage: null,
          chatTurns: 1,
        }),
      });

      expect(result.status).toBe('waitlisted');
      expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(
        updatedRows.find(row => {
          const q = row.qualificationResult as
            | { details?: { goldenPathHold?: string } }
            | undefined;
          return q?.details?.goldenPathHold === 'hold_outranked';
        })
      ).toBeTruthy();
      // The pending read uses the drain's filter, so entrants it would not
      // admit today cannot crowd out someone who can be admitted now.
      expect(executedSql.join(' ')).toContain('spotify_url IS NOT NULL');
      expect(executedSql.join(' ')).toContain('waitlisted_at <=');
    });

    it('never reserves capacity for a held decision', async () => {
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );
      const result = await submitWaitlistAccessRequest({
        ...baseInput,
        goldenPathAdmission: {
          admit: false,
          reason: 'hold_high_profile_needs_verification',
        },
      });

      expect(result.status).toBe('waitlisted');
      expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
      expect(
        updatedRows.find(row => {
          const q = row.qualificationResult as
            | { details?: { goldenPathHold?: string } }
            | undefined;
          return (
            q?.details?.goldenPathHold ===
            'hold_high_profile_needs_verification'
          );
        })
      ).toBeTruthy();
    });
  });

  it('waitlists fresh submissions even when delayed auto-accept has capacity', async () => {
    findLatestEntryByEmail.mockReturnValueOnce([]); // no existing entry
    getWaitlistSettings.mockResolvedValueOnce({
      gateEnabled: true,
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 10,
      autoAcceptedToday: 0,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    });

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    expect(result.outcome).toBe('waitlisted_gate_on');
    expect(result.status).toBe('waitlisted');
    expect(tryReserveAutoAcceptSlot).not.toHaveBeenCalled();
    expect(approveWaitlistEntryInTx).not.toHaveBeenCalled();
    expect(notifySlackWaitlist).toHaveBeenCalledTimes(1);
  });

  it('qualifies an unqualified sign-up entry instead of treating it as a resubmission', async () => {
    userRow = { id: 'user-1', userStatus: 'waitlist_pending' };
    findLatestEntryByEmail.mockReturnValueOnce([
      {
        id: 'entry-signup',
        status: 'waitlisted',
        source: 'signup',
        waitlistedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]);

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );
    const result = await submitWaitlistAccessRequest(baseInput);

    // Full qualification ran on the sign-up entry: no new row, no
    // already_waitlisted short-circuit.
    expect(result).toMatchObject({
      entryId: 'entry-signup',
      status: 'waitlisted',
      outcome: 'waitlisted_gate_on',
    });
    expect(
      insertedEntries.some(entry => 'emailNormalized' in (entry.vals as object))
    ).toBe(false);
    expect(
      updatedRows.find(row => row.statusReason === 'chat_started')
    ).toMatchObject({ source: 'waitlist_form', fullName: 'Test Creator' });
    expect(notifySlackWaitlist).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the authenticated app user row is missing', async () => {
    userRow = null;

    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );

    await expect(submitWaitlistAccessRequest(baseInput)).rejects.toThrow(
      'Authenticated app user is missing'
    );
    expect(insertedEntries.some(entry => 'clerkId' in entry.vals)).toBe(false);
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
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

  it('suppresses email and Slack while audit-marking an exact canary write', async () => {
    vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', 'synthetic@e2e.example.com');
    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );

    const result = await submitWaitlistAccessRequest({
      ...baseInput,
      email: 'synthetic+jovie-prod-waitlist-canary@e2e.example.com',
      syntheticRunId: '123-1',
    });

    expect(result).toMatchObject({
      status: 'waitlisted',
      outcome: 'waitlisted_gate_on',
    });
    expect(
      insertedEntries.some(
        entry => entry.vals.jobType === 'send_waitlist_email'
      )
    ).toBe(false);
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
    expect(
      insertedEntries.find(entry => entry.vals.waitlistEntryId === 'entry-new')
        ?.vals.metadata
    ).toMatchObject({
      syntheticCanary: {
        schemaVersion: 1,
        name: 'production-waitlist',
        runId: '123-1',
        communications: {
          waitlistConfirmationEmail: 'suppressed-before-enqueue',
          slack: 'suppressed',
        },
      },
    });
  });

  it('suppresses communications for the exact canary even without a run marker', async () => {
    vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', 'synthetic@e2e.example.com');
    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );

    await submitWaitlistAccessRequest({
      ...baseInput,
      email: 'synthetic+jovie-prod-waitlist-canary@e2e.example.com',
    });

    expect(
      insertedEntries.some(
        entry => entry.vals.jobType === 'send_waitlist_email'
      )
    ).toBe(false);
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it.each([undefined, 'invalid+base@e2e.example.com'])(
    'keeps the reserved namespace suppressed when base config is %s',
    async baseEmail => {
      if (baseEmail) vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', baseEmail);
      const { submitWaitlistAccessRequest } = await import(
        '@/lib/waitlist/access-request'
      );

      await submitWaitlistAccessRequest({
        ...baseInput,
        email: 'synthetic+jovie-prod-waitlist-canary@e2e.example.com',
      });

      expect(
        insertedEntries.some(
          entry => entry.vals.jobType === 'send_waitlist_email'
        )
      ).toBe(false);
      expect(notifySlackWaitlist).not.toHaveBeenCalled();
    }
  );

  it('writes a fresh audit receipt on an idempotent canary reassertion', async () => {
    vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', 'synthetic@e2e.example.com');
    findLatestEntryByEmail.mockReturnValueOnce([
      {
        id: 'entry-retained',
        status: 'waitlisted',
        waitlistedAt: new Date('2026-08-10T00:00:00.000Z'),
      },
    ]);
    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );

    const result = await submitWaitlistAccessRequest({
      ...baseInput,
      email: 'synthetic+jovie-prod-waitlist-canary@e2e.example.com',
      syntheticRunId: '123-2',
    });

    expect(result.outcome).toBe('already_waitlisted');
    expect(
      insertedEntries.find(
        entry => entry.vals.reason === 'production_canary_reasserted'
      )?.vals.metadata
    ).toMatchObject({ syntheticCanary: { runId: '123-2' } });
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });

  it('rejects a synthetic run marker for every non-exact identity', async () => {
    vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', 'synthetic@e2e.example.com');
    const { submitWaitlistAccessRequest } = await import(
      '@/lib/waitlist/access-request'
    );

    await expect(
      submitWaitlistAccessRequest({
        ...baseInput,
        syntheticRunId: '123-1',
      })
    ).rejects.toThrow('restricted to the exact canary email');
    expect(insertedEntries).toHaveLength(0);
    expect(notifySlackWaitlist).not.toHaveBeenCalled();
  });
});

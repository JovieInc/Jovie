import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockDbSelect,
  mockDbUpdate,
  mockDbQuery,
  mockLogger,
  mockEnqueueBulkClaimInviteJobs,
  mockHashEmail,
} = vi.hoisted(() => {
  const mockWhere = vi.fn().mockReturnThis();
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockFrom = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ limit: mockLimit }),
    innerJoin: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  return {
    mockDbSelect: vi.fn().mockReturnValue({ from: mockFrom }),
    mockDbUpdate: vi.fn().mockReturnValue({ set: mockSet }),
    mockDbQuery: {
      emailSuppressions: { findMany: vi.fn().mockResolvedValue([]) },
      campaignSequences: { findMany: vi.fn().mockResolvedValue([]) },
    },
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    mockEnqueueBulkClaimInviteJobs: vi.fn().mockResolvedValue(undefined),
    mockHashEmail: vi
      .fn()
      .mockImplementation((email: string) => `hash_${email}`),
  };
});

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    query: mockDbQuery,
  },
}));

vi.mock('@/lib/db/schema/admin', () => ({
  campaignSettings: {
    id: 'id',
    campaignsEnabled: 'campaigns_enabled',
  },
}));

// Mock schema tables as plain objects with column references
vi.mock('@/lib/db/schema/email-engagement', () => ({
  campaignEnrollments: {
    id: 'id',
    campaignSequenceId: 'campaign_sequence_id',
    subjectId: 'subject_id',
    recipientHash: 'recipient_hash',
    currentStep: 'current_step',
    stepCompletedAt: 'step_completed_at',
    nextStepAt: 'next_step_at',
    status: 'status',
    stopReason: 'stop_reason',
    updatedAt: 'updated_at',
  },
  campaignSequences: {
    id: 'id',
    isActive: 'is_active',
    steps: 'steps',
  },
  emailEngagement: {
    recipientHash: 'recipient_hash',
    eventType: 'event_type',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorClaimInvites: {
    id: 'id',
    email: 'email',
    creatorProfileId: 'creator_profile_id',
    sentAt: 'sent_at',
    status: 'status',
    meta: 'meta',
  },
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
    isClaimed: 'is_claimed',
  },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  emailSuppressions: {
    emailHash: 'email_hash',
    reason: 'reason',
    expiresAt: 'expires_at',
  },
}));

vi.mock('@/lib/email/jobs/enqueue', () => ({
  enqueueBulkClaimInviteJobs: mockEnqueueBulkClaimInviteJobs,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  hashEmail: mockHashEmail,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

// Mock drizzle-orm operators to pass through
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  gt: vi.fn((a: unknown, b: unknown) => ({ type: 'gt', a, b })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ type: 'inArray', a, b })),
  isNull: vi.fn((a: unknown) => ({ type: 'isNull', a })),
  lte: vi.fn((a: unknown, b: unknown) => ({ type: 'lte', a, b })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}));

// --- Helpers ---

function createMockEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enrollment-1',
    campaignSequenceId: 'seq-1',
    subjectId: 'subject-1',
    recipientHash: 'rechash-1',
    currentStep: '1',
    stepCompletedAt: { 1: '2026-01-01T00:00:00Z' },
    nextStepAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function createMockSequence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seq-1',
    name: 'Test Campaign',
    isActive: 'true' as const,
    steps: [
      {
        stepNumber: 1,
        delayHours: 0,
        templateKey: 'invite_initial',
        subject: 'Claim your profile',
      },
      {
        stepNumber: 2,
        delayHours: 48,
        templateKey: 'invite_followup_1',
        subject: 'Reminder: claim your profile',
        stopConditions: [{ type: 'claimed' as const }],
      },
      {
        stepNumber: 3,
        delayHours: 72,
        templateKey: 'invite_followup_2',
        subject: 'Last chance to claim',
        stopConditions: [
          { type: 'claimed' as const },
          { type: 'unsubscribed' as const },
        ],
        skipConditions: [{ type: 'opened' as const }],
      },
    ],
    description: 'Test campaign',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function _createMockClaimInviteData(overrides: Record<string, unknown> = {}) {
  return {
    invite: { id: 'invite-1', email: 'artist@example.com' },
    profile: {
      id: 'subject-1',
      username: 'artist',
      displayName: 'The Artist',
      avatarUrl: null,
      meta: { claimToken: 'token-abc' },
    },
    ...overrides,
  };
}

/**
 * Sets up the full mock chain for processCampaigns().
 *
 * The processor calls db.select(), db.update(), and db.query in various patterns.
 * This helper configures them in order of invocation within processCampaigns:
 *   1. fetchPendingEnrollments → db.select().from().where().limit()
 *   2. batchFetchClaimStatus → db.select().from().where()
 *   3. batchFetchEngagements → db.select().from().where()
 *   4. batchFetchClaimInvites → db.select().from().innerJoin().where().orderBy()
 *   5. batchFetchEmailSuppressions → db.select().from().where()
 *   6. batchFetchSuppressions → db.query.emailSuppressions.findMany()
 *   7. loadSequenceMap → db.query.campaignSequences.findMany()
 */
function setupProcessingMocks(options: {
  enrollments?: ReturnType<typeof createMockEnrollment>[];
  sequences?: ReturnType<typeof createMockSequence>[];
  claimedProfileIds?: string[];
  suppressionRows?: Array<{ emailHash: string; reason: string }>;
  engagementRows?: Array<{ recipientHash: string; eventType: string }>;
  claimInviteRows?: Array<{
    inviteId: string;
    email: string;
    creatorProfileId: string;
    sentAt: Date;
    profileId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    meta: { claimToken?: string } | null;
  }>;
  emailSuppressionRows?: Array<{ emailHash: string; reason: string }>;
}) {
  const enrollments = options.enrollments ?? [createMockEnrollment()];
  const sequences = options.sequences ?? [createMockSequence()];
  const claimedIds = options.claimedProfileIds ?? [];
  const engagementRows = options.engagementRows ?? [];
  const claimInviteRows = options.claimInviteRows ?? [
    {
      inviteId: 'invite-1',
      email: 'artist@example.com',
      creatorProfileId: 'subject-1',
      sentAt: new Date('2026-01-01'),
      profileId: 'subject-1',
      username: 'artist',
      displayName: 'The Artist',
      avatarUrl: null,
      meta: { claimToken: 'token-abc' },
    },
  ];
  const emailSuppressionRows = options.emailSuppressionRows ?? [];

  // Track call order for db.select()
  // Call sequence:
  //   1. campaignSettings check (campaigns_enabled)
  //   2. fetchPendingEnrollments
  //   3. batchFetchClaimStatus
  //   4. batchFetchEngagements
  //   5. batchFetchClaimInvites (via innerJoin)
  //   6. batchFetchEmailSuppressions
  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    const callNum = selectCallCount;

    const mockOrderBy = vi.fn().mockResolvedValue(claimInviteRows);
    const mockInnerJoinWhere = vi
      .fn()
      .mockReturnValue({ orderBy: mockOrderBy });
    const mockInnerJoin = vi
      .fn()
      .mockReturnValue({ where: mockInnerJoinWhere });

    const mockLimit = vi.fn().mockImplementation(() => {
      // First call: campaignSettings check — return enabled
      if (callNum === 1) {
        return Promise.resolve([{ campaignsEnabled: true }]);
      }
      // Second call: fetchPendingEnrollments
      return Promise.resolve(enrollments);
    });
    const mockWhere = vi.fn().mockImplementation(() => {
      // First select call is campaignSettings check (has .limit())
      if (callNum === 1) {
        return { limit: mockLimit };
      }
      // Second select call is fetchPendingEnrollments (has .limit())
      if (callNum === 2) {
        return { limit: mockLimit };
      }
      // Third is batchFetchClaimStatus (returns claimed profile rows)
      if (callNum === 3) {
        return Promise.resolve(claimedIds.map(id => ({ id })));
      }
      // Fourth is batchFetchEngagements
      if (callNum === 4) {
        return Promise.resolve(engagementRows);
      }
      // Sixth is batchFetchEmailSuppressions
      if (callNum === 6) {
        return Promise.resolve(emailSuppressionRows);
      }
      return Promise.resolve([]);
    });

    return {
      from: vi.fn().mockReturnValue({
        where: mockWhere,
        innerJoin: mockInnerJoin,
        limit: mockLimit,
      }),
    };
  });

  // db.query mocks (suppression findMany + sequence findMany run in parallel)
  mockDbQuery.emailSuppressions.findMany.mockResolvedValue(
    options.suppressionRows ?? []
  );
  mockDbQuery.campaignSequences.findMany.mockResolvedValue(sequences);

  // db.update mock chain
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  mockDbUpdate.mockReturnValue({ set: mockUpdateSet });
}

/**
 * Retrieves the shared `.set()` / `.where()` spies for the current test's
 * `db.update()` mock chain (configured by `setupProcessingMocks`).
 *
 * `mockDbUpdate.mockReturnValue({ set: mockUpdateSet })` returns the SAME
 * object for every `db.update()` call within a test, so `.mock.results[n]`
 * always points at the same `set`/`where` spies — this lets us assert on the
 * exact payload written for a specific enrollment (by pairing `set` call
 * index N with `where` call index N, since each processed enrollment issues
 * at most one `db.update().set().where()` chain in enrollment order).
 */
function getUpdateSpies() {
  const lastCall = mockDbUpdate.mock.results.at(-1)?.value as
    | { set: ReturnType<typeof vi.fn> }
    | undefined;
  if (!lastCall) {
    throw new Error('db.update() was never called in this test');
  }
  const setSpy = lastCall.set;
  const setResult = setSpy.mock.results.at(-1)?.value as
    | { where: ReturnType<typeof vi.fn> }
    | undefined;
  if (!setResult) {
    throw new Error('db.update().set() was never called in this test');
  }
  return { setSpy, whereSpy: setResult.where };
}

// --- Tests ---

describe('email/campaigns/processor.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processCampaigns', () => {
    it('returns zero counts when no pending enrollments exist', async () => {
      setupProcessingMocks({ enrollments: [] });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result).toEqual({
        processed: 0,
        sent: 0,
        skipped: 0,
        stopped: 0,
        completed: 0,
        errors: 0,
      });
    });

    it('processes pending enrollments and sends follow-up emails', async () => {
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledTimes(1);
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledWith(
        expect.anything(),
        [{ inviteId: 'invite-1', creatorProfileId: 'subject-1' }],
        { minDelayMs: 0, maxDelayMs: 60000 }
      );
    });

    it('logs and rethrows errors from the main processing loop', async () => {
      // Make fetchPendingEnrollments throw
      mockDbSelect.mockImplementation(() => {
        throw new Error('DB connection failed');
      });
      mockDbQuery.campaignSequences.findMany.mockResolvedValue([]);

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );

      await expect(processCampaigns()).rejects.toThrow('DB connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Campaign Processor] Failed to process campaigns',
        expect.objectContaining({ error: 'DB connection failed' })
      );
    });

    it('processes multiple enrollments in a single batch', async () => {
      const enrollments = [
        createMockEnrollment({
          id: 'e-1',
          subjectId: 'sub-1',
          recipientHash: 'rh-1',
        }),
        createMockEnrollment({
          id: 'e-2',
          subjectId: 'sub-2',
          recipientHash: 'rh-2',
        }),
      ];
      const claimInviteRows = [
        {
          inviteId: 'inv-1',
          email: 'a@example.com',
          creatorProfileId: 'sub-1',
          sentAt: new Date(),
          profileId: 'sub-1',
          username: 'a',
          displayName: 'A',
          avatarUrl: null,
          meta: { claimToken: 'tok-1' },
        },
        {
          inviteId: 'inv-2',
          email: 'b@example.com',
          creatorProfileId: 'sub-2',
          sentAt: new Date(),
          profileId: 'sub-2',
          username: 'b',
          displayName: 'B',
          avatarUrl: null,
          meta: { claimToken: 'tok-2' },
        },
      ];

      setupProcessingMocks({ enrollments, claimInviteRows });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(2);
    });
  });

  describe('stop conditions', () => {
    it('stops enrollment when profile has been claimed', async () => {
      setupProcessingMocks({
        claimedProfileIds: ['subject-1'],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'claimed' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('stops enrollment when recipient has unsubscribed', async () => {
      setupProcessingMocks({
        suppressionRows: [{ emailHash: 'rechash-1', reason: 'user_request' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'unsubscribed' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        status: 'stopped',
        stopReason: 'unsubscribed',
        updatedAt: expect.any(Date),
      });
    });

    it('stops enrollment when recipient has bounced (hard_bounce)', async () => {
      setupProcessingMocks({
        suppressionRows: [{ emailHash: 'rechash-1', reason: 'hard_bounce' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'bounced' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
      // The DB stopReason is the literal condition name ('bounced'), not the
      // underlying suppression reason string — lock in the exact value so a
      // mutant that leaks `suppression.reason` instead fails loudly.
      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        status: 'stopped',
        stopReason: 'bounced',
        updatedAt: expect.any(Date),
      });
    });

    it('stops enrollment when recipient has soft-bounced (identical gating + stopReason as hard_bounce)', async () => {
      // processor.ts treats hard_bounce and soft_bounce identically for the
      // 'bounced' stop condition — this test locks in that there is NO special
      // "still send on soft bounce" carve-out in the current implementation.
      setupProcessingMocks({
        suppressionRows: [{ emailHash: 'rechash-1', reason: 'soft_bounce' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'bounced' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        status: 'stopped',
        stopReason: 'bounced',
        updatedAt: expect.any(Date),
      });
    });

    it('stops enrollment when recipient has opened the email', async () => {
      setupProcessingMocks({
        engagementRows: [{ recipientHash: 'rechash-1', eventType: 'open' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'opened' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
    });

    it('stops enrollment when recipient has clicked', async () => {
      setupProcessingMocks({
        engagementRows: [{ recipientHash: 'rechash-1', eventType: 'click' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'clicked' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
    });
  });

  describe('skip conditions', () => {
    it('skips step when recipient has opened and skip condition is opened', async () => {
      setupProcessingMocks({
        engagementRows: [{ recipientHash: 'rechash-1', eventType: 'open' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                skipConditions: [{ type: 'opened' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
      // Enrollment should be advanced, not stopped
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('skips step when recipient has clicked and skip condition is clicked', async () => {
      setupProcessingMocks({
        engagementRows: [{ recipientHash: 'rechash-1', eventType: 'click' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                skipConditions: [{ type: 'clicked' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
    });
  });

  describe('email suppression checks', () => {
    it('stops enrollment when email-level suppression is found', async () => {
      setupProcessingMocks({
        emailSuppressionRows: [
          { emailHash: 'hash_artist@example.com', reason: 'hard_bounce' },
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        status: 'stopped',
        stopReason: 'suppressed:hard_bounce',
        updatedAt: expect.any(Date),
      });
    });

    it('blocks send via the unconditional email-suppression safety net even when the step defines no unsubscribed/bounced stopCondition', async () => {
      // This is the regression this suite exists to prevent: the final
      // email-hash suppression check in processEnrollment() runs regardless
      // of the step's configured stopConditions. A step author who forgets to
      // add `stopConditions: [{ type: 'unsubscribed' }]` must still be
      // protected from emailing a suppressed recipient.
      setupProcessingMocks({
        emailSuppressionRows: [
          { emailHash: 'hash_artist@example.com', reason: 'user_request' },
        ],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                // Deliberately no stopConditions / skipConditions at all.
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockEnqueueBulkClaimInviteJobs).not.toHaveBeenCalled();
      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        status: 'stopped',
        stopReason: 'suppressed:user_request',
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('campaign sequence validation', () => {
    it('stops enrollment when campaign sequence is inactive', async () => {
      setupProcessingMocks({
        sequences: [createMockSequence({ isActive: 'false' })],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.stopped).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('stops enrollment when campaign sequence is not found', async () => {
      setupProcessingMocks({ sequences: [] });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      // No sequence found means sequence?.isActive !== 'true' -> stopped
      expect(result.stopped).toBe(1);
    });

    it('completes enrollment when there is no next step', async () => {
      // Enrollment is at step 2, sequence only has 2 steps
      setupProcessingMocks({
        enrollments: [createMockEnrollment({ currentStep: '2' })],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.completed).toBe(1);
      expect(result.sent).toBe(0);
    });
  });

  describe('missing invite data', () => {
    it('increments errors when no claim invite data is found', async () => {
      setupProcessingMocks({ claimInviteRows: [] });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Campaign Processor] No invite data found',
        expect.objectContaining({
          enrollmentId: 'enrollment-1',
          subjectId: 'subject-1',
        })
      );
    });
  });

  describe('enrollment processing errors', () => {
    it('increments errors and logs when individual enrollment processing fails', async () => {
      setupProcessingMocks({});
      // Make enqueue throw to trigger per-enrollment error handling
      mockEnqueueBulkClaimInviteJobs.mockRejectedValueOnce(
        new Error('Queue unavailable')
      );

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Campaign Processor] Failed to process enrollment',
        expect.objectContaining({ error: 'Queue unavailable' })
      );
    });
  });

  describe('follow-up email sending', () => {
    it('calls enqueueBulkClaimInviteJobs with correct invite data and delays', async () => {
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      await processCampaigns();

      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledWith(
        expect.anything(), // db instance
        [
          {
            inviteId: 'invite-1',
            creatorProfileId: 'subject-1',
          },
        ],
        {
          minDelayMs: 0,
          maxDelayMs: 60000,
        }
      );
    });

    it('logs sent follow-up with masked email', async () => {
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      await processCampaigns();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Campaign Processor] Sent follow-up',
        expect.objectContaining({
          enrollmentId: 'enrollment-1',
          step: 2,
          email: expect.stringContaining('***'),
        })
      );
    });
  });

  describe('enrollment advancement', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('updates enrollment to next step after sending', async () => {
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      await processCampaigns();

      // db.update should have been called to advance the enrollment
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('writes the exact advancement payload for a clean recipient when no further step exists', async () => {
      const fixedNow = new Date('2026-02-01T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      setupProcessingMocks({
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.sent).toBe(1);
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledWith(
        expect.anything(),
        [{ inviteId: 'invite-1', creatorProfileId: 'subject-1' }],
        { minDelayMs: 0, maxDelayMs: 60000 }
      );

      const { setSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenCalledWith({
        currentStep: '2',
        stepCompletedAt: {
          1: '2026-01-01T00:00:00Z',
          2: fixedNow.toISOString(),
        },
        nextStepAt: null,
        status: 'completed',
        updatedAt: fixedNow,
      });
    });

    it('writes a computed nextStepAt (based on the following step delayHours) when a further step exists', async () => {
      const fixedNow = new Date('2026-02-01T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      // Default 3-step sequence: enrollment is at step 1, sends step 2
      // (delayHours 48, unused for scheduling here), and the NEXT step (3)
      // has delayHours 72 — nextStepAt must be derived from step 3's delay,
      // not step 2's, since it represents "when step 3 becomes due".
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.sent).toBe(1);

      const { setSpy } = getUpdateSpies();
      const expectedNextStepAt = new Date(
        fixedNow.getTime() + 72 * 60 * 60 * 1000
      );
      expect(setSpy).toHaveBeenCalledWith({
        currentStep: '2',
        stepCompletedAt: {
          1: '2026-01-01T00:00:00Z',
          2: fixedNow.toISOString(),
        },
        nextStepAt: expectedNextStepAt,
        status: 'active',
        updatedAt: fixedNow,
      });
    });
  });

  describe('batch isolation (multiple enrollments in one processCampaigns() run)', () => {
    it('consults the suppression source exactly once for the whole batch, not once per enrollment', async () => {
      const enrollments = [
        createMockEnrollment({
          id: 'e-1',
          subjectId: 'sub-1',
          recipientHash: 'rh-1',
        }),
        createMockEnrollment({
          id: 'e-2',
          subjectId: 'sub-2',
          recipientHash: 'rh-2',
        }),
      ];
      const claimInviteRows = [
        {
          inviteId: 'inv-1',
          email: 'a@example.com',
          creatorProfileId: 'sub-1',
          sentAt: new Date(),
          profileId: 'sub-1',
          username: 'a',
          displayName: 'A',
          avatarUrl: null,
          meta: { claimToken: 'tok-1' },
        },
        {
          inviteId: 'inv-2',
          email: 'b@example.com',
          creatorProfileId: 'sub-2',
          sentAt: new Date(),
          profileId: 'sub-2',
          username: 'b',
          displayName: 'B',
          avatarUrl: null,
          meta: { claimToken: 'tok-2' },
        },
      ];

      setupProcessingMocks({ enrollments, claimInviteRows });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(2);
      // A mutant that removes the batch lookup (or re-queries per enrollment)
      // must fail here: the suppression source is queried exactly once for
      // the entire pending batch.
      expect(mockDbQuery.emailSuppressions.findMany).toHaveBeenCalledTimes(1);
    });

    it('suppresses only the flagged recipient in a batch while still sending to the clean recipient', async () => {
      const enrollments = [
        createMockEnrollment({
          id: 'e-1',
          subjectId: 'sub-1',
          recipientHash: 'rh-1',
        }),
        createMockEnrollment({
          id: 'e-2',
          subjectId: 'sub-2',
          recipientHash: 'rh-2',
        }),
      ];
      const claimInviteRows = [
        {
          inviteId: 'inv-1',
          email: 'a@example.com',
          creatorProfileId: 'sub-1',
          sentAt: new Date(),
          profileId: 'sub-1',
          username: 'a',
          displayName: 'A',
          avatarUrl: null,
          meta: { claimToken: 'tok-1' },
        },
        {
          inviteId: 'inv-2',
          email: 'b@example.com',
          creatorProfileId: 'sub-2',
          sentAt: new Date(),
          profileId: 'sub-2',
          username: 'b',
          displayName: 'B',
          avatarUrl: null,
          meta: { claimToken: 'tok-2' },
        },
      ];

      setupProcessingMocks({
        enrollments,
        claimInviteRows,
        // Only rh-2 (e-2's recipient) is unsubscribed.
        suppressionRows: [{ emailHash: 'rh-2', reason: 'user_request' }],
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
                stopConditions: [{ type: 'unsubscribed' }],
              },
            ],
          }),
        ],
      });

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(1);
      expect(result.stopped).toBe(1);

      // Only the clean recipient's invite is dispatched — the suppressed
      // recipient's invite (inv-2) must never reach the send call.
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledTimes(1);
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledWith(
        expect.anything(),
        [{ inviteId: 'inv-1', creatorProfileId: 'sub-1' }],
        { minDelayMs: 0, maxDelayMs: 60000 }
      );

      // db.update() is called once per enrollment, in processing order:
      // call 0 -> e-1 (advance/sent), call 1 -> e-2 (stop/suppressed).
      const { setSpy, whereSpy } = getUpdateSpies();
      expect(setSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          status: 'stopped',
          stopReason: 'unsubscribed',
        })
      );
      expect(whereSpy).toHaveBeenNthCalledWith(2, {
        type: 'eq',
        a: 'id',
        b: 'e-2',
      });
      expect(whereSpy).toHaveBeenNthCalledWith(1, {
        type: 'eq',
        a: 'id',
        b: 'e-1',
      });
    });

    it('a send failure for one enrollment does not block or corrupt processing of the next enrollment in the batch', async () => {
      const enrollments = [
        createMockEnrollment({
          id: 'e-1',
          subjectId: 'sub-1',
          recipientHash: 'rh-1',
        }),
        createMockEnrollment({
          id: 'e-2',
          subjectId: 'sub-2',
          recipientHash: 'rh-2',
        }),
      ];
      const claimInviteRows = [
        {
          inviteId: 'inv-1',
          email: 'a@example.com',
          creatorProfileId: 'sub-1',
          sentAt: new Date(),
          profileId: 'sub-1',
          username: 'a',
          displayName: 'A',
          avatarUrl: null,
          meta: { claimToken: 'tok-1' },
        },
        {
          inviteId: 'inv-2',
          email: 'b@example.com',
          creatorProfileId: 'sub-2',
          sentAt: new Date(),
          profileId: 'sub-2',
          username: 'b',
          displayName: 'B',
          avatarUrl: null,
          meta: { claimToken: 'tok-2' },
        },
      ];

      setupProcessingMocks({
        enrollments,
        claimInviteRows,
        sequences: [
          createMockSequence({
            steps: [
              {
                stepNumber: 1,
                delayHours: 0,
                templateKey: 't1',
                subject: 's1',
              },
              {
                stepNumber: 2,
                delayHours: 24,
                templateKey: 't2',
                subject: 's2',
              },
            ],
          }),
        ],
      });
      // The FIRST send (e-1 / inv-1) fails; the second (e-2 / inv-2) succeeds.
      mockEnqueueBulkClaimInviteJobs.mockRejectedValueOnce(
        new Error('Provider down')
      );

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      const result = await processCampaigns();

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.sent).toBe(1);

      // Both sends were attempted — the failure of the first did not skip
      // the second.
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenCalledTimes(2);
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        [{ inviteId: 'inv-1', creatorProfileId: 'sub-1' }],
        { minDelayMs: 0, maxDelayMs: 60000 }
      );
      expect(mockEnqueueBulkClaimInviteJobs).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        [{ inviteId: 'inv-2', creatorProfileId: 'sub-2' }],
        { minDelayMs: 0, maxDelayMs: 60000 }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Campaign Processor] Failed to process enrollment',
        expect.objectContaining({
          enrollmentId: 'e-1',
          error: 'Provider down',
        })
      );

      // The failed enrollment (e-1) must NOT be advanced/marked sent — only
      // the successful one (e-2) gets a db.update() call. A mutant that
      // advances the enrollment before/regardless of the send result would
      // leave a duplicate-send risk on the next cron tick undetected without
      // this assertion.
      expect(mockDbUpdate).toHaveBeenCalledTimes(1);
      const { whereSpy } = getUpdateSpies();
      expect(whereSpy).toHaveBeenCalledWith({ type: 'eq', a: 'id', b: 'e-2' });
    });
  });
});

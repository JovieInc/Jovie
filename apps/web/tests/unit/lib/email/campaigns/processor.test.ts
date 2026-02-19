import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  },
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
    claimToken: 'claim_token',
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
      claimToken: 'token-abc',
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
    claimToken: string | null;
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
      claimToken: 'token-abc',
    },
  ];
  const emailSuppressionRows = options.emailSuppressionRows ?? [];

  // Track call order for db.select()
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

    const mockLimit = vi.fn().mockResolvedValue(enrollments);
    const mockWhere = vi.fn().mockImplementation(() => {
      // First select call is fetchPendingEnrollments (has .limit())
      if (callNum === 1) {
        return { limit: mockLimit };
      }
      // Second is batchFetchClaimStatus (returns claimed profile rows)
      if (callNum === 2) {
        return Promise.resolve(claimedIds.map(id => ({ id })));
      }
      // Third is batchFetchEngagements
      if (callNum === 3) {
        return Promise.resolve(engagementRows);
      }
      // Fifth is batchFetchEmailSuppressions
      if (callNum === 5) {
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
          claimToken: 'tok-1',
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
          claimToken: 'tok-2',
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
    it('updates enrollment to next step after sending', async () => {
      setupProcessingMocks({});

      const { processCampaigns } = await import(
        '@/lib/email/campaigns/processor'
      );
      await processCampaigns();

      // db.update should have been called to advance the enrollment
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });
});

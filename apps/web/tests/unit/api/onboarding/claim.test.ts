import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks (must be before imports of SUT)
const {
  mockGetCachedAuth,
  mockGetCachedCurrentUser,
  mockGetCurrentOnboardingSessionId,
  mockClearOnboardingSessionCookie,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockExtractClientIP,
  mockLoggerWarn,
  mockLoggerError,
  mockCaptureError,
  mockMaterializeClaimedOnboardingProfile,
  mockSubmitWaitlistAccessRequest,
  mockIsWaitlistGateEnabled,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetCachedCurrentUser: vi.fn(),
  mockGetCurrentOnboardingSessionId: vi.fn(),
  mockClearOnboardingSessionCookie: vi.fn().mockResolvedValue(undefined),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockExtractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
  mockMaterializeClaimedOnboardingProfile: vi.fn(),
  mockSubmitWaitlistAccessRequest: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: mockGetCachedCurrentUser,
}));

vi.mock('@/lib/waitlist/access-request', () => ({
  submitWaitlistAccessRequest: mockSubmitWaitlistAccessRequest,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('@/lib/onboarding/session', () => ({
  getCurrentOnboardingSessionId: mockGetCurrentOnboardingSessionId,
  clearOnboardingSessionCookie: mockClearOnboardingSessionCookie,
}));

vi.mock('@/lib/onboarding/claim-profile', () => ({
  materializeClaimedOnboardingProfile: mockMaterializeClaimedOnboardingProfile,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'chat_conversations.id',
    sessionId: 'chat_conversations.session_id',
    userId: 'chat_conversations.user_id',
    createdAt: 'chat_conversations.created_at',
    updatedAt: 'chat_conversations.updated_at',
    title: 'chat_conversations.title',
  },
  chatAuditLog: {
    userId: 'chat_audit_log.user_id',
    creatorProfileId: 'chat_audit_log.creator_profile_id',
    conversationId: 'chat_audit_log.conversation_id',
    action: 'chat_audit_log.action',
    field: 'chat_audit_log.field',
    previousValue: 'chat_audit_log.previous_value',
    newValue: 'chat_audit_log.new_value',
    metadata: 'chat_audit_log.metadata',
    ipAddress: 'chat_audit_log.ip_address',
    userAgent: 'chat_audit_log.user_agent',
  },
  chatMessages: {
    toolCalls: 'chat_messages.tool_calls',
    conversationId: 'chat_messages.conversation_id',
    createdAt: 'chat_messages.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ inArray: [col, vals] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: mockExtractClientIP,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

import { POST } from '@/app/api/onboarding/claim/route';

function makeRequest(): Request {
  return new Request('http://localhost/api/onboarding/claim', {
    method: 'POST',
    headers: { 'user-agent': 'test-agent/1.0' },
  });
}

function setupDbSelectForCandidates(
  candidates: Array<{ id: string; createdAt: Date }>,
  messageRows: Array<{ toolCalls: unknown }> = []
) {
  const orderBy = vi.fn().mockResolvedValue(candidates);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValueOnce({ from });

  if (candidates.length > 0) {
    const messageOrderBy = vi.fn().mockResolvedValue(messageRows);
    const messageWhere = vi.fn().mockReturnValue({ orderBy: messageOrderBy });
    const messageFrom = vi.fn().mockReturnValue({ where: messageWhere });
    mockDbSelect.mockReturnValueOnce({ from: messageFrom });
  } else {
    const claimedLimit = vi.fn().mockResolvedValue([]);
    const claimedOrderBy = vi.fn().mockReturnValue({ limit: claimedLimit });
    const claimedWhere = vi.fn().mockReturnValue({ orderBy: claimedOrderBy });
    const claimedFrom = vi.fn().mockReturnValue({ where: claimedWhere });
    mockDbSelect.mockReturnValueOnce({ from: claimedFrom });
  }
}

function waitlistDecisionMessageRows() {
  return [
    {
      toolCalls: [
        {
          schemaVersion: 2,
          toolCallId: 'social-1',
          toolName: 'proposeSocialLink',
          state: 'succeeded',
          input: {},
          output: {
            action: 'propose_social_link',
            url: 'https://instagram.com/test-creator',
          },
          uiHint: 'artifact',
        },
        {
          schemaVersion: 2,
          toolCallId: 'decision-1',
          toolName: 'proposeNextStep',
          state: 'succeeded',
          input: {},
          output: {
            action: 'propose_next_step',
            decision: { kind: 'waitlist', rationale: 'controlled', score: 30 },
          },
          uiHint: 'artifact',
        },
      ],
    },
  ];
}

function waitlistDecisionAfterSocialSkipRows() {
  return [
    {
      toolCalls: [
        {
          schemaVersion: 2,
          toolCallId: 'artist-1',
          toolName: 'confirmSpotifyArtist',
          state: 'succeeded',
          input: {},
          output: {
            action: 'spotify_artist_confirmed',
            spotifyArtistId: 'artist-1',
            artist: {
              id: 'artist-1',
              name: 'Test Creator',
              url: 'https://open.spotify.com/artist/artist-1',
              imageUrl: null,
              followers: 100,
              popularity: 10,
              genres: [],
            },
          },
          uiHint: 'artifact',
        },
        {
          schemaVersion: 2,
          toolCallId: 'decision-1',
          toolName: 'proposeNextStep',
          state: 'succeeded',
          input: {},
          output: {
            action: 'propose_next_step',
            decision: { kind: 'waitlist', rationale: 'controlled', score: 100 },
          },
          uiHint: 'artifact',
        },
      ],
    },
  ];
}

function setupRecoveredClaim(
  conversationId: string,
  messageRows: Array<{ toolCalls: unknown }>
) {
  const candidatesOrderBy = vi.fn().mockResolvedValue([]);
  const candidatesWhere = vi.fn().mockReturnValue({
    orderBy: candidatesOrderBy,
  });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where: candidatesWhere }),
  });

  const claimedLimit = vi.fn().mockResolvedValue([{ id: conversationId }]);
  const claimedOrderBy = vi.fn().mockReturnValue({ limit: claimedLimit });
  const claimedWhere = vi.fn().mockReturnValue({ orderBy: claimedOrderBy });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where: claimedWhere }),
  });

  const messagesOrderBy = vi.fn().mockResolvedValue(messageRows);
  const messagesWhere = vi.fn().mockReturnValue({ orderBy: messagesOrderBy });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where: messagesWhere }),
  });
}

function setupOwnedConversation(conversationId: string, owned: boolean) {
  const limit = vi
    .fn()
    .mockResolvedValue(owned ? [{ id: conversationId }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where }),
  });
}

function setupUpdateForPrimary(claimedRows: number) {
  const returning = vi
    .fn()
    .mockResolvedValue(claimedRows > 0 ? [{ id: 'conv_primary' }] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValueOnce({ set });
}

function setupUpdateForSiblings() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValueOnce({ set });
}

function setupInsertAudit(success = true) {
  if (success) {
    const values = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValueOnce({ values });
  } else {
    const values = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'duplicate key value violates unique constraint "idx_chat_conversations_session_id_claimed_unique"'
        )
      );
    mockDbInsert.mockReturnValueOnce({ values });
  }
}

// Pure helper extracted for property testing the recency ordering + idempotency invariants
// (mirrors the [primary, ...others] + desc createdAt logic in the route without duplicating prod code).
function pickPrimaryAndOthers<T extends { createdAt: Date }>(
  cands: T[]
): { primary: T | undefined; others: T[] } {
  if (!cands.length) return { primary: undefined, others: [] };
  const sorted = [...cands].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  return { primary: sorted[0], others: sorted.slice(1) };
}

describe('POST /api/onboarding/claim — race, idempotency, failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({
      userId: '3a53ba3e-150c-4ab5-8e73-2d2499764e2c',
      sessionId: 'ba_session_123',
      orgId: null,
    });
    mockGetCurrentOnboardingSessionId.mockResolvedValue('sess_abc123');
    mockExtractClientIP.mockReturnValue('10.0.0.1');
    mockMaterializeClaimedOnboardingProfile.mockResolvedValue({
      profileId: null,
      handle: null,
      status: 'skipped',
    });
    mockGetCachedCurrentUser.mockResolvedValue({
      fullName: 'Test Creator',
      username: 'test-creator',
      primaryEmailAddress: { emailAddress: 'creator@example.com' },
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      entryId: 'entry-1',
      status: 'waitlisted',
      outcome: 'waitlisted_gate_on',
    });
    mockIsWaitlistGateEnabled.mockResolvedValue(false);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.errorCode).toBe('UNAUTHORIZED');
    expect(mockGetCurrentOnboardingSessionId).not.toHaveBeenCalled();
  });

  it('returns 401 when a Better Auth session has no provisioned app user', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: null,
      sessionId: 'ba_session_without_app_user',
      orgId: null,
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ errorCode: 'UNAUTHORIZED' });
    expect(mockGetCurrentOnboardingSessionId).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns {claimed: 0} (no-op) when no onboarding session cookie', async () => {
    mockGetCurrentOnboardingSessionId.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 0 });
    expect(mockClearOnboardingSessionCookie).not.toHaveBeenCalled();
  });

  it('clears cookie and returns {claimed:0} when no unclaimed conversations for session', async () => {
    setupDbSelectForCandidates([]); // none
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 0 });
    expect(mockClearOnboardingSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('recovers the durable waitlist receipt after a committed response is lost', async () => {
    setupRecoveredClaim('conv_already_claimed', waitlistDecisionMessageRows());

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      claimed: 0,
      alreadyClaimed: true,
      conversationId: 'conv_already_claimed',
      waitlist: { entryId: 'entry-1', status: 'waitlisted' },
    });
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledTimes(1);
    expect(mockClearOnboardingSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('recovers an approved handoff and materializes checkout after a response is lost', async () => {
    setupRecoveredClaim(
      'conv_approved_recovery',
      waitlistDecisionMessageRows()
    );
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      entryId: 'entry-approved',
      status: 'approved',
      outcome: 'already_accepted',
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      claimed: 0,
      alreadyClaimed: true,
      conversationId: 'conv_approved_recovery',
    });
    expect(mockMaterializeClaimedOnboardingProfile).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv_approved_recovery' })
    );
  });

  it('claims the single (most recent) candidate, writes audit, clears cookie, returns claimed count', async () => {
    const appUserId = '3a53ba3e-150c-4ab5-8e73-2d2499764e2c';
    setupDbSelectForCandidates([
      { id: 'conv_1', createdAt: new Date('2026-05-01') },
    ]);
    setupUpdateForPrimary(1);
    setupInsertAudit(true);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      claimed: 1,
      conversationId: 'conv_1',
    });
    expect(mockClearOnboardingSessionCookie).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbUpdate.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ userId: appUserId })
    );
    expect(mockDbInsert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: appUserId, newValue: appUserId })
    );
    expect(mockMaterializeClaimedOnboardingProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: appUserId })
    );
    // ip/ua passed via extract
    expect(mockExtractClientIP).toHaveBeenCalled();
  });

  it('persists a waitlist decision and returns its durable receipt without materializing a profile', async () => {
    const appUserId = '3a53ba3e-150c-4ab5-8e73-2d2499764e2c';
    setupDbSelectForCandidates(
      [{ id: 'conv_waitlist', createdAt: new Date('2026-05-01') }],
      waitlistDecisionMessageRows()
    );
    setupUpdateForPrimary(1);
    setupInsertAudit(true);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      claimed: 1,
      conversationId: 'conv_waitlist',
      waitlist: {
        entryId: 'entry-1',
        status: 'waitlisted',
        outcome: 'waitlisted_gate_on',
      },
    });
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        appUserId,
        email: 'creator@example.com',
        source: 'onboarding_chat_claim',
        data: expect.objectContaining({
          primarySocialUrl: 'https://instagram.com/test-creator',
        }),
      })
    );
    expect(mockMaterializeClaimedOnboardingProfile).not.toHaveBeenCalled();
  });

  it('rechecks the authoritative gate at claim time when the persisted decision is not waitlist', async () => {
    const socialOnlyRows = [
      {
        toolCalls: waitlistDecisionMessageRows()[0]?.toolCalls.slice(0, 1),
      },
    ];
    mockIsWaitlistGateEnabled.mockResolvedValue(true);
    setupDbSelectForCandidates(
      [{ id: 'conv_gate_toggled', createdAt: new Date('2026-05-01') }],
      socialOnlyRows
    );
    setupUpdateForPrimary(1);
    setupInsertAudit(true);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      waitlist: { entryId: 'entry-1', status: 'waitlisted' },
    });
    expect(mockMaterializeClaimedOnboardingProfile).not.toHaveBeenCalled();
  });

  it('refuses to consume the transcript when the current gate is on but durable artist data is missing', async () => {
    mockIsWaitlistGateEnabled.mockResolvedValue(true);
    setupDbSelectForCandidates(
      [{ id: 'conv_missing_artist', createdAt: new Date('2026-05-01') }],
      []
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      claimed: 0,
      waitlistIntakeRequired: true,
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockClearOnboardingSessionCookie).not.toHaveBeenCalled();
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    expect(mockMaterializeClaimedOnboardingProfile).not.toHaveBeenCalled();
  });

  it('uses the confirmed Spotify profile when the visitor skips social attachment', async () => {
    setupDbSelectForCandidates(
      [{ id: 'conv_social_skip', createdAt: new Date('2026-05-01') }],
      waitlistDecisionAfterSocialSkipRows()
    );
    setupUpdateForPrimary(1);
    setupInsertAudit(true);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          primarySocialUrl: 'https://open.spotify.com/artist/artist-1',
        }),
      })
    );
  });

  it('continues profile onboarding when the canonical writer returns approved access', async () => {
    setupDbSelectForCandidates(
      [{ id: 'conv_approved', createdAt: new Date('2026-05-01') }],
      waitlistDecisionMessageRows()
    );
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      entryId: 'entry-approved',
      status: 'approved',
      outcome: 'already_accepted',
    });
    setupUpdateForPrimary(1);
    setupInsertAudit(true);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty('waitlist');
    expect(mockMaterializeClaimedOnboardingProfile).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv_approved' })
    );
  });

  it('fails closed after ownership claim and leaves the cookie for a retry when the durable write fails', async () => {
    setupDbSelectForCandidates(
      [{ id: 'conv_waitlist', createdAt: new Date('2026-05-01') }],
      waitlistDecisionMessageRows()
    );
    mockSubmitWaitlistAccessRequest.mockRejectedValue(new Error('db down'));
    setupUpdateForPrimary(1);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      errorCode: 'WAITLIST_SAVE_FAILED',
    });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockClearOnboardingSessionCookie).not.toHaveBeenCalled();
    expect(mockMaterializeClaimedOnboardingProfile).not.toHaveBeenCalled();
  });

  it('handles multiple candidates: claims primary (recency order), detaches siblings, writes audit with discarded list', async () => {
    const c1 = { id: 'old_1', createdAt: new Date('2026-04-01') };
    const c2 = { id: 'newer', createdAt: new Date('2026-05-01') };
    setupDbSelectForCandidates([c2, c1]); // desc order: primary = newer
    setupUpdateForPrimary(1);
    setupUpdateForSiblings();
    setupInsertAudit(true);

    const res = await POST(makeRequest());
    expect(await res.json()).toMatchObject({
      claimed: 2,
      conversationId: 'newer',
    });
    // sibling update was issued
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it('idempotent on concurrent claim race: CAS returns 0 rows → soft success with alreadyClaimed, clears cookie', async () => {
    setupDbSelectForCandidates([{ id: 'conv_1', createdAt: new Date() }]);
    setupUpdateForPrimary(0); // race lost
    setupOwnedConversation('conv_1', true);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      claimed: 0,
      alreadyClaimed: true,
      conversationId: 'conv_1',
    });
    expect(mockClearOnboardingSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('rejects a concurrent claim owned by a different authenticated user before writing waitlist data', async () => {
    setupDbSelectForCandidates(
      [{ id: 'conv_cross_user', createdAt: new Date() }],
      waitlistDecisionMessageRows()
    );
    setupUpdateForPrimary(0);
    setupOwnedConversation('conv_cross_user', false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      errorCode: 'SESSION_ALREADY_CLAIMED',
    });
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    expect(mockClearOnboardingSessionCookie).not.toHaveBeenCalled();
  });

  it('returns 409 SESSION_ALREADY_CLAIMED on unique constraint violation (session claimed by different user)', async () => {
    setupDbSelectForCandidates([{ id: 'conv_1', createdAt: new Date() }]);
    setupUpdateForPrimary(1);
    setupInsertAudit(false); // throws unique

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.errorCode).toBe('SESSION_ALREADY_CLAIMED');
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('returns 500 and captures on unexpected error', async () => {
    mockGetCurrentOnboardingSessionId.mockRejectedValue(new Error('boom'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ errorCode: 'INTERNAL_ERROR' });
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.stringContaining('Onboarding claim endpoint failed'),
      expect.any(Error),
      expect.objectContaining({ route: '/api/onboarding/claim' })
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe('claim route invariants (property tests for recency, idempotency, data races, 409)', () => {
  const timestampArb = fc.integer({
    min: Date.UTC(2020, 0, 1),
    max: Date.UTC(2026, 5, 1),
  });
  const candidateArb = fc.record({
    id: fc.uuid(),
    createdAt: timestampArb.map(t => new Date(t)),
  });

  it('recency ordering: primary is always the most recently created (or undefined)', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { maxLength: 12 }), cands => {
        const { primary, others } = pickPrimaryAndOthers(cands);
        if (primary) {
          for (const o of others) {
            expect(primary.createdAt.getTime()).toBeGreaterThanOrEqual(
              o.createdAt.getTime()
            );
          }
        }
        // ordering property holds
        expect(others.length).toBe(Math.max(0, cands.length - 1));
      })
    );
  });

  it('idempotent pick: pick(pick(xs)) shape equals pick(xs) for the primary/others split', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { maxLength: 8 }), cands => {
        const once = pickPrimaryAndOthers(cands);
        const twice = pickPrimaryAndOthers(
          once.primary ? [once.primary, ...once.others] : []
        );
        if (once.primary) {
          expect(twice.primary?.createdAt.getTime()).toBe(
            once.primary.createdAt.getTime()
          );
        } else {
          expect(twice.primary).toBeUndefined();
        }
        expect(twice.others.length).toBe(once.others.length);
      })
    );
  });

  it('failure path safety: empty candidates always yields zero others, never throws on pick', () => {
    fc.assert(
      fc.property(fc.constant([]), () => {
        const { primary, others } = pickPrimaryAndOthers([]);
        expect(primary).toBeUndefined();
        expect(others).toEqual([]);
      })
    );
  });

  it('recency with timestamp ties: primary time is a maximum (covers sort in recency ordering)', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { minLength: 2, maxLength: 6 }),
        cands => {
          if (cands.length >= 2) {
            cands[1] = { ...cands[1], createdAt: cands[0].createdAt };
          }
          const { primary, others } = pickPrimaryAndOthers(cands);
          if (primary) {
            const maxT = Math.max(...cands.map(c => c.createdAt.getTime()));
            expect(primary.createdAt.getTime()).toBe(maxT);
            expect(others.length).toBe(cands.length - 1);
          }
        }
      )
    );
  });

  it('409 error classification (data race to different user): messages with "unique" or idx string yield 409 SESSION_ALREADY_CLAIMED (property over varied error strings)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(
            'duplicate key value violates unique constraint "idx_chat_conversations_session_id_claimed_unique"'
          ),
          fc
            .string({ minLength: 3, maxLength: 40 })
            .map(s => `foo ${s} unique bar`),
          fc.constant('unique constraint violation on session claim')
        ),
        async msg => {
          vi.clearAllMocks();
          mockGetCachedAuth.mockResolvedValue({
            userId: '3a53ba3e-150c-4ab5-8e73-2d2499764e2c',
            sessionId: 'ba_session_property',
            orgId: null,
          });
          mockGetCurrentOnboardingSessionId.mockResolvedValue('sess_409_prop');
          setupDbSelectForCandidates([{ id: 'c1', createdAt: new Date() }]);
          setupUpdateForPrimary(1);
          const values = vi.fn().mockRejectedValue(new Error(msg));
          mockDbInsert.mockReturnValueOnce({ values });
          const res = await POST(makeRequest());
          expect(res.status).toBe(409);
          const body = await res.json();
          expect(body.errorCode).toBe('SESSION_ALREADY_CLAIMED');
        }
      ),
      { numRuns: 15 }
    );
  });
});

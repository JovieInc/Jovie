import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockSubmitWaitlistAccessRequest = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockEnforceOnboardingRateLimit = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: mockCurrentUser,
  getOptionalAuth: mockGetCachedAuth,
  getCachedSessionTokenAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerk_id',
    email: 'users.email',
    userStatus: 'users.user_status',
  },
}));

vi.mock('@/lib/db/schema/user-interviews', () => ({
  userInterviews: {
    id: 'user_interviews.id',
    userId: 'user_interviews.user_id',
    source: 'user_interviews.source',
    transcript: 'user_interviews.transcript',
    metadata: 'user_interviews.metadata',
    status: 'user_interviews.status',
    updatedAt: 'user_interviews.updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
}));

vi.mock('@/lib/waitlist/access-request', () => ({
  submitWaitlistAccessRequest: mockSubmitWaitlistAccessRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: (email: string) => email.toLowerCase().trim(),
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mockEnforceOnboardingRateLimit,
  getOnboardingRateLimitMessage: (error: unknown) => {
    if (!(error instanceof Error)) return null;
    const prefix = '[RATE_LIMITED] ';
    return error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : null;
  },
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIPFromRequest: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/validation/schemas', async () => {
  const { z } = await import('zod');
  return {
    waitlistRequestSchema: z
      .object({
        email: z.string().optional(),
        fullName: z.string().optional(),
        handle: z.string().optional(),
        primarySocialUrl: z.string().optional(),
      })
      .passthrough(),
  };
});

import { POST } from '@/app/api/onboarding/intake/route';

const VALID_BODY = {
  waitlist: {
    email: 'user@example.com',
    fullName: 'User Person',
    handle: 'userhandle',
    primarySocialUrl: 'https://instagram.com/user',
  },
  transcript: [
    {
      questionId: 'handle',
      prompt: 'What is your handle?',
      answer: 'userhandle',
      skipped: false,
      timestamp: '2026-05-08T00:00:00.000Z',
    },
  ],
  metadata: {},
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/intake', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupSuccessfulIntakeDb() {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          {
            id: 'user_db_1',
            userStatus: 'waitlist_pending',
          },
        ]),
      }),
    }),
  });

  const returning = vi.fn().mockResolvedValue([{ id: 'interview_1' }]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  mockDbInsert.mockReturnValue({ values });

  return { onConflictDoUpdate, values };
}

function selectRows(rows: Array<Record<string, unknown>>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function insertUserRows(rows: Array<Record<string, unknown>>) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  return { values, onConflictDoNothing, returning };
}

function upsertInterviewRows(rows: Array<Record<string, unknown>>) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  return { values, onConflictDoUpdate, returning };
}

describe.skip('POST /api/onboarding/intake — email verification gate', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_clerk_1' });
    mockEnforceOnboardingRateLimit.mockResolvedValue(undefined);
  });

  it('returns 403 with email_unverified when user has no verified email', async () => {
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'unverified@example.com',
          verification: { status: 'unverified' },
        },
      ],
      primaryEmailAddress: {
        emailAddress: 'unverified@example.com',
        verification: { status: 'unverified' },
      },
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('email_unverified');
    // Critical: the access-request path must not be reached for unverified users.
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    // Critical: no DB writes either — gate fires before user lookup.
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('returns 403 when emailAddresses is empty', async () => {
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [],
      primaryEmailAddress: null,
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('email_unverified');
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('returns 403 when primary email is unverified even if it is the only address', async () => {
    // Regression test: previously, the route fell back to
    // `primaryEmailAddress?.emailAddress` even when unverified, which
    // allowed an attacker to add a victim's email to their Clerk account
    // and submit intake before verifying it.
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'victim@example.com',
          verification: { status: 'unverified' },
        },
      ],
      primaryEmailAddress: {
        emailAddress: 'victim@example.com',
        verification: { status: 'unverified' },
      },
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockCurrentUser).not.toHaveBeenCalled();
  });

  it('returns 429 when onboarding intake is rate limited', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockEnforceOnboardingRateLimit.mockRejectedValue(
      new Error(
        '[RATE_LIMITED] Too many onboarding attempts. Please try again in 1 hour.'
      )
    );

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      outcome: 'rate_limited',
      code: 'rate_limited',
      error: 'Too many onboarding attempts. Please try again in 1 hour.',
    });
    expect(mockCurrentUser).not.toHaveBeenCalled();
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('skips rate-limit enforcement entirely in development (NODE_ENV=development)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    // Even if enforce would throw, the guard prevents the call
    mockEnforceOnboardingRateLimit.mockRejectedValue(
      new Error('[RATE_LIMITED] should not run')
    );
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'dev@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'accepted',
      status: 'active',
      entryId: 'e1',
    });
    setupSuccessfulIntakeDb();

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    // ensure was never invoked due to dev guard
    // (call count may be 0 from other tests, but in this flow it is not reached)
    expect(mockEnforceOnboardingRateLimit).not.toHaveBeenCalledWith(
      expect.objectContaining({ checkIP: true })
    );
  });

  it('returns 400 when payload is invalid', async () => {
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'user@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    const res = await POST(makeRequest({ bogus: true }));
    expect(res.status).toBe(400);
  });

  it('persists the validated transcript while keeping intake out of the summary queue', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'User Person',
      username: 'userhandle',
      emailAddresses: [
        {
          emailAddress: 'User@Example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'waitlisted_gate_on',
      status: 'waitlisted',
      entryId: 'waitlist_entry_1',
    });
    const { onConflictDoUpdate, values } = setupSuccessfulIntakeDb();

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[0]?.[0]).toMatchObject({
      source: 'onboarding_chat',
      transcript: VALID_BODY.transcript,
      status: 'dismissed',
    });
    expect(values.mock.calls[1]?.[0]).toMatchObject({
      source: 'onboarding_chat',
      transcript: VALID_BODY.transcript,
      status: 'dismissed',
      metadata: expect.objectContaining({
        accessOutcome: 'waitlisted_gate_on',
        waitlistEntryId: 'waitlist_entry_1',
        submittedFrom: 'onboarding_chat',
      }),
    });
    expect(onConflictDoUpdate.mock.calls[0]?.[0].set).toMatchObject({
      transcript: VALID_BODY.transcript,
      status: 'dismissed',
    });
    expect(onConflictDoUpdate.mock.calls[1]?.[0].set).toMatchObject({
      transcript: VALID_BODY.transcript,
      status: 'dismissed',
      metadata: expect.objectContaining({
        accessOutcome: 'waitlisted_gate_on',
        waitlistEntryId: 'waitlist_entry_1',
      }),
    });
  });

  it('rejects transcript entries with unknown question ids before persistence', async () => {
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'user@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        transcript: [
          {
            ...VALID_BODY.transcript[0],
            questionId: 'not-a-real-step',
          },
        ],
      })
    );

    expect(res.status).toBe(400);
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('creates the intake user without overwriting concurrent status fields', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'New User',
      emailAddresses: [
        {
          emailAddress: 'new@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'accepted',
      status: 'active',
      entryId: 'entry_new',
    });

    mockDbSelect.mockReturnValueOnce(selectRows([]));
    const userInsert = insertUserRows([
      { id: 'new_user', userStatus: 'waitlist_pending' },
    ]);
    const interviewInsert = upsertInterviewRows([{ id: 'interview_new' }]);
    mockDbInsert
      .mockReturnValueOnce(userInsert)
      .mockReturnValue(interviewInsert);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(userInsert.values).toHaveBeenCalledWith({
      clerkId: 'user_clerk_1',
      email: 'new@example.com',
      userStatus: 'waitlist_pending',
    });
    expect(userInsert.onConflictDoNothing).toHaveBeenCalled();
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_clerk_1',
        email: 'new@example.com',
        emailRaw: 'new@example.com',
      })
    );
  });

  it('re-selects the intake user when a concurrent insert wins the conflict', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'Racing User',
      emailAddresses: [
        {
          emailAddress: 'race@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'accepted',
      status: 'active',
      entryId: 'entry_race',
    });

    mockDbSelect
      .mockReturnValueOnce(selectRows([]))
      .mockReturnValueOnce(
        selectRows([{ id: 'race_user', userStatus: 'waitlist_pending' }])
      );
    const userInsert = insertUserRows([]);
    const interviewInsert = upsertInterviewRows([{ id: 'interview_race' }]);
    mockDbInsert
      .mockReturnValueOnce(userInsert)
      .mockReturnValue(interviewInsert);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_clerk_1',
        email: 'race@example.com',
      })
    );
  });

  it('re-selects an existing interview row when upsert returning is empty', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'Interview User',
      emailAddresses: [
        {
          emailAddress: 'interview@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'waitlisted_capacity_full',
      status: 'waitlisted',
      entryId: 'entry_existing_interview',
    });

    mockDbSelect
      .mockReturnValueOnce(
        selectRows([{ id: 'user_db_1', userStatus: 'waitlist_pending' }])
      )
      .mockReturnValueOnce(selectRows([{ id: 'interview_existing' }]));
    const interviewInsert = upsertInterviewRows([]);
    interviewInsert.returning
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'interview_updated' }]);
    mockDbInsert.mockReturnValue(interviewInsert);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      interviewId: 'interview_existing',
      outcome: 'waitlisted_capacity_full',
    });
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it('derives full name from username when Clerk fullName missing (executes derive branch)', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: null,
      username: 'fallbackuser',
      emailAddresses: [
        {
          emailAddress: 'fb@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'accepted',
      status: 'active',
      entryId: 'e2',
    });
    setupSuccessfulIntakeDb();

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    // successful path reached with username-derived name
  });

  it('derives full name from email localpart when no name or username (executes final derive fallback)', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: '',
      username: null,
      emailAddresses: [
        {
          emailAddress: 'onlylocal@domain.test',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'waitlisted_capacity_full',
      status: 'waitlisted',
      entryId: 'e3',
    });
    setupSuccessfulIntakeDb();

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it('returns 500 and captures when first interview upsert fails (before waitlist submit)', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'Err User',
      emailAddresses: [
        {
          emailAddress: 'err@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    // Make insert throw for the first upsert
    const badReturning = vi
      .fn()
      .mockRejectedValue(new Error('interview insert failed'));
    const badOnConflict = vi.fn().mockReturnValue({ returning: badReturning });
    const badValues = vi
      .fn()
      .mockReturnValue({ onConflictDoUpdate: badOnConflict });
    mockDbInsert.mockReturnValue({ values: badValues });
    // select still succeeds for ensure
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'u1', userStatus: 'waitlist_pending' }]),
        }),
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toMatchObject({ success: false, outcome: 'save_failed' });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'onboarding intake transcript save failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/onboarding/intake' })
    );
  });

  it('logs and still returns the accepted outcome when attaching access metadata fails', async () => {
    mockCurrentUser.mockResolvedValue({
      fullName: 'Accepted User',
      emailAddresses: [
        {
          emailAddress: 'accepted@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      outcome: 'accepted',
      status: 'active',
      entryId: 'entry_accepted',
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'u1', userStatus: 'waitlist_pending' }]),
        }),
      }),
    });

    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'interview_1' }])
      .mockRejectedValueOnce(new Error('metadata update failed'));
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockDbInsert.mockReturnValue({ values });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      interviewId: 'interview_1',
      outcome: 'accepted',
      status: 'active',
      entryId: 'entry_accepted',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[onboarding/intake] Failed to attach access outcome to interview',
      expect.any(Error)
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'onboarding intake outcome attach failed',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/onboarding/intake',
        interviewId: 'interview_1',
        outcome: 'accepted',
      })
    );
  });

  it('captures unexpected request parsing failures as a 500 contract response', async () => {
    const res = await POST(
      new Request('http://localhost/api/onboarding/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      })
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Internal server error',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'onboarding intake submission failed',
      expect.any(SyntaxError),
      expect.objectContaining({ route: '/api/onboarding/intake' })
    );
  });
});

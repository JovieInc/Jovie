import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockSubmitWaitlistAccessRequest = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockEnforceOnboardingRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mockCurrentUser,
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
    warn: vi.fn(),
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

describe('POST /api/onboarding/intake — email verification gate', () => {
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

  it('stores privacy-preserving intake metadata without queueing summarization', async () => {
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
      transcript: [],
      status: 'dismissed',
    });
    expect(values.mock.calls[1]?.[0]).toMatchObject({
      source: 'onboarding_chat',
      transcript: [],
      status: 'dismissed',
      metadata: expect.objectContaining({
        accessOutcome: 'waitlisted_gate_on',
        waitlistEntryId: 'waitlist_entry_1',
        submittedFrom: 'onboarding_chat',
      }),
    });
    expect(onConflictDoUpdate.mock.calls[0]?.[0].set).toMatchObject({
      transcript: [],
      status: 'dismissed',
    });
    expect(onConflictDoUpdate.mock.calls[1]?.[0].set).toMatchObject({
      transcript: [],
      status: 'dismissed',
      metadata: expect.objectContaining({
        accessOutcome: 'waitlisted_gate_on',
        waitlistEntryId: 'waitlist_entry_1',
      }),
    });
  });
});

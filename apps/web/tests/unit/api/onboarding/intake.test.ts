import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockSubmitWaitlistAccessRequest = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mockCurrentUser,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
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
    updatedAt: 'users.updated_at',
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

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/waitlist/access-request', () => ({
  submitWaitlistAccessRequest: mockSubmitWaitlistAccessRequest,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => ({ and: conditions })),
  eq: vi.fn((left, right) => ({ eq: [left, right] })),
}));

import { POST } from '@/app/api/onboarding/intake/route';

function createSelectRows(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createInsertReturning(rows: unknown[], rejection?: Error) {
  const returning = rejection
    ? vi.fn().mockRejectedValue(rejection)
    : vi.fn().mockResolvedValue(rows);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });

  return {
    builder: { values },
    values,
    onConflictDoUpdate,
    returning,
  };
}

function validRequestBody() {
  return {
    waitlist: {
      primaryGoal: null,
      primarySocialUrl: 'https://instagram.com/testuser',
      spotifyUrl: null,
      spotifyArtistName: null,
    },
    transcript: [
      {
        questionId: 'handle',
        prompt: 'What handle do you want on Jovie?',
        answer: 'testuser',
        skipped: false,
        timestamp: '2026-04-29T12:00:00.000Z',
      },
    ],
    metadata: {
      requestedHandle: 'testuser',
      currentWorkflow: 'Posting one release a month.',
      biggestBlocker: 'Keeping links current.',
      launchGoal: 'Convert profile visits into listeners.',
    },
  };
}

function createRequest(body: unknown) {
  return new Request('http://localhost/api/onboarding/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Onboarding Intake API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'Test@Example.com' }],
      fullName: 'Test User',
      username: 'testuser',
    });
    mockSubmitWaitlistAccessRequest.mockResolvedValue({
      entryId: 'entry_123',
      status: 'new',
      outcome: 'waitlisted_gate_on',
    });
  });

  it('returns 401 when the user is not authenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const response = await POST(createRequest(validRequestBody()));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when the authenticated user has no email', async () => {
    mockCurrentUser.mockResolvedValue({ emailAddresses: [] });

    const response = await POST(createRequest(validRequestBody()));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email is required');
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when transcript validation fails', async () => {
    const response = await POST(
      createRequest({
        ...validRequestBody(),
        transcript: [],
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request');
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
  });

  it('saves the transcript before requesting access and then stores the outcome', async () => {
    const firstInterviewInsert = createInsertReturning([
      { id: 'interview_123' },
    ]);
    const secondInterviewInsert = createInsertReturning([
      { id: 'interview_123' },
    ]);
    mockDbSelect.mockReturnValueOnce(
      createSelectRows([{ id: 'db_user_123', userStatus: 'waitlist_pending' }])
    );
    mockDbInsert
      .mockReturnValueOnce(firstInterviewInsert.builder)
      .mockReturnValueOnce(secondInterviewInsert.builder);

    const response = await POST(createRequest(validRequestBody()));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      interviewId: 'interview_123',
      outcome: 'waitlisted_gate_on',
      status: 'new',
      entryId: 'entry_123',
    });
    expect(
      firstInterviewInsert.returning.mock.invocationCallOrder[0]
    ).toBeLessThan(mockSubmitWaitlistAccessRequest.mock.invocationCallOrder[0]);
    expect(mockSubmitWaitlistAccessRequest).toHaveBeenCalledWith({
      clerkUserId: 'clerk_123',
      email: 'test@example.com',
      emailRaw: 'Test@Example.com',
      fullName: 'Test User',
      data: validRequestBody().waitlist,
    });
    expect(firstInterviewInsert.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({
          transcript: validRequestBody().transcript,
          metadata: expect.objectContaining({
            submittedFrom: 'onboarding_chat',
            accessOutcome: null,
            waitlistEntryId: null,
          }),
          status: 'pending',
          updatedAt: expect.any(Date),
        }),
      })
    );
    expect(secondInterviewInsert.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          metadata: expect.objectContaining({
            submittedFrom: 'onboarding_chat',
            accessOutcome: 'waitlisted_gate_on',
            waitlistEntryId: 'entry_123',
          }),
        }),
      })
    );
  });

  it('creates a missing DB user before saving the interview', async () => {
    const userInsert = createInsertReturning([
      { id: 'db_user_123', userStatus: 'waitlist_pending' },
    ]);
    const firstInterviewInsert = createInsertReturning([
      { id: 'interview_123' },
    ]);
    const secondInterviewInsert = createInsertReturning([
      { id: 'interview_123' },
    ]);
    mockDbSelect.mockReturnValueOnce(createSelectRows([]));
    mockDbInsert
      .mockReturnValueOnce(userInsert.builder)
      .mockReturnValueOnce(firstInterviewInsert.builder)
      .mockReturnValueOnce(secondInterviewInsert.builder);

    const response = await POST(createRequest(validRequestBody()));

    expect(response.status).toBe(200);
    expect(userInsert.values).toHaveBeenCalledWith({
      clerkId: 'clerk_123',
      email: 'Test@Example.com',
      userStatus: 'waitlist_pending',
    });
  });

  it('returns save_failed and skips access decision when transcript storage fails', async () => {
    const failedInterviewInsert = createInsertReturning(
      [],
      new Error('insert failed')
    );
    mockDbSelect.mockReturnValueOnce(
      createSelectRows([{ id: 'db_user_123', userStatus: 'waitlist_pending' }])
    );
    mockDbInsert.mockReturnValueOnce(failedInterviewInsert.builder);

    const response = await POST(createRequest(validRequestBody()));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, outcome: 'save_failed' });
    expect(mockSubmitWaitlistAccessRequest).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'onboarding intake transcript save failed',
      expect.any(Error),
      { route: '/api/onboarding/intake' }
    );
  });
});

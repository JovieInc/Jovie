import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildWelcomeMessage,
  mockCaptureError,
  mockGetSessionContext,
  mockGetSessionErrorResponse,
  mockWithDbSessionTx,
} = vi.hoisted(() => ({
  mockBuildWelcomeMessage: vi.fn(),
  mockCaptureError: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockGetSessionErrorResponse: vi.fn(),
  mockWithDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/services/onboarding/welcome-message', () => ({
  buildWelcomeMessage: mockBuildWelcomeMessage,
}));

vi.mock('@/app/api/chat/session-error-response', () => ({
  getSessionErrorResponse: mockGetSessionErrorResponse,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

function createTransaction(selectResults: unknown[] = []) {
  const results = [...selectResults];
  const insertReturningResults: unknown[] = [[{ id: 'conv_new' }], [], []];

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn(() => ({
    where: updateWhereMock,
  }));
  const updateMock = vi.fn(() => ({
    set: updateSetMock,
  }));

  const insertMock = vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi
        .fn()
        .mockResolvedValue(insertReturningResults.shift() ?? []),
    })),
  }));

  const executeMock = vi.fn().mockResolvedValue(undefined);

  const selectMock = vi.fn(() => {
    const rows = results.shift() ?? [];
    const terminal = {
      orderBy: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (value: unknown) => unknown) => resolve(rows),
    };

    const fromChain = {
      innerJoin: vi.fn(() => fromChain),
      where: vi.fn(() => terminal),
    };

    return {
      from: vi.fn(() => fromChain),
    };
  });

  return {
    execute: executeMock,
    insert: insertMock,
    select: selectMock,
    update: updateMock,
    updateSetMock,
    updateWhereMock,
  };
}

describe('POST /api/onboarding/welcome-chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionContext.mockResolvedValue({
      user: { id: 'db_user_123', clerkId: 'clerk_user_123' },
      profile: { id: 'profile_123' },
    });
    mockBuildWelcomeMessage.mockReturnValue('Welcome to Jovie');
    mockGetSessionErrorResponse.mockReturnValue(null);
  });

  it('returns 404 when the authenticated user has no profile', async () => {
    mockGetSessionContext.mockResolvedValueOnce({
      user: { id: 'db_user_123', clerkId: 'clerk_user_123' },
      profile: null,
    });

    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile not found',
    });
  }, 15_000);

  it('returns 400 when the initial reply exceeds the size limit', async () => {
    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({ initialReply: 'x'.repeat(2001) }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Initial reply must be 2000 characters or less.',
    });
  });

  it('reuses an existing conversation without duplicating the same initial reply', async () => {
    const tx = createTransaction([
      [{ id: 'conv_existing' }],
      [{ content: 'Hello again', role: 'user' }],
    ]);
    mockWithDbSessionTx.mockImplementationOnce(async callback => callback(tx));

    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({ initialReply: 'Hello again' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      conversationId: 'conv_existing',
      route: '/app/chat/conv_existing?panel=profile&from=onboarding',
      reused: true,
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('creates a new welcome conversation and returns the onboarding chat route', async () => {
    const tx = createTransaction([
      [],
      [{ value: 8 }],
      [{ value: 2 }],
      [{ value: 1 }],
      [{ value: 3 }],
      [
        {
          careerHighlights: 'Highlights',
          displayName: 'Artist',
          spotifyId: null,
          spotifyUrl: null,
          username: 'artist',
        },
      ],
    ]);
    mockWithDbSessionTx.mockImplementationOnce(async callback => callback(tx));

    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({ initialReply: 'Let us go' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      success: true,
      conversationId: 'conv_new',
      route: '/app/chat/conv_new?panel=profile&from=onboarding',
      reused: false,
    });
    expect(mockBuildWelcomeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Artist',
        releaseCount: 2,
        trackCount: 8,
        dspCount: 1,
        socialCount: 3,
        careerHighlights: 'Highlights',
      })
    );
    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('returns the mapped session error response when auth context resolution fails', async () => {
    const mapped = NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
    mockWithDbSessionTx.mockRejectedValueOnce(new Error('Unauthorized'));
    mockGetSessionErrorResponse.mockReturnValueOnce(mapped);

    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('captures and returns 500 for unexpected failures', async () => {
    const crash = new Error('db crashed');
    mockWithDbSessionTx.mockRejectedValueOnce(crash);

    const { POST } = await import('@/app/api/onboarding/welcome-chat/route');
    const response = await POST(
      new Request('http://localhost/api/onboarding/welcome-chat', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Onboarding welcome chat bootstrap failed',
      crash,
      expect.objectContaining({ route: '/api/onboarding/welcome-chat' })
    );
  });
});

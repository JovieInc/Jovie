import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectOrderByMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectWhereMock = vi
    .fn()
    .mockReturnValue({ orderBy: selectOrderByMock });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const insertReturningMock = vi.fn();
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  // For count query
  const countWhereMock = vi.fn();
  const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

  return {
    getSessionContextMock: vi.fn(),
    selectMock,
    selectFromMock,
    selectWhereMock,
    selectOrderByMock,
    selectLimitMock,
    insertMock,
    insertValuesMock,
    insertReturningMock,
    countFromMock,
    countWhereMock,
    captureErrorMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: {
    id: 'id',
    title: 'title',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    creatorProfileId: 'creatorProfileId',
    userId: 'userId',
  },
  chatMessages: {
    conversationId: 'conversationId',
    role: 'role',
    content: 'content',
  },
}));

vi.mock('drizzle-orm', () => ({
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@/app/api/chat/session-error-response', () => ({
  getSessionErrorResponse: vi.fn().mockReturnValue(null),
}));

describe('GET /api/chat/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(
      new TypeError('Unauthorized')
    );

    const mod = await import('@/app/api/chat/session-error-response');
    const { getSessionErrorResponse } = mod as unknown as {
      getSessionErrorResponse: ReturnType<typeof vi.fn>;
    };
    const { NextResponse } = await import('next/server');
    getSessionErrorResponse.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns 404 when no profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });

    const { GET } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations');
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('returns conversations list for authenticated user', async () => {
    const conversations = [
      {
        id: 'conv_1',
        title: 'Test Conv',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.selectLimitMock.mockResolvedValue(conversations);

    const { GET } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].id).toBe('conv_1');
    expect(body.conversations[0].title).toBe('Test Conv');
  });

  it('respects limit query parameter', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.selectLimitMock.mockResolvedValue([]);

    const { GET } = await import('@/app/api/chat/conversations/route');
    const request = new Request(
      'http://localhost/api/chat/conversations?limit=5'
    );
    await GET(request);

    expect(hoisted.selectOrderByMock).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('DB error'));

    const { GET } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations');
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});

describe('POST /api/chat/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(
      new TypeError('Unauthorized')
    );

    const mod = await import('@/app/api/chat/session-error-response');
    const { getSessionErrorResponse } = mod as unknown as {
      getSessionErrorResponse: ReturnType<typeof vi.fn>;
    };
    const { NextResponse } = await import('next/server');
    getSessionErrorResponse.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { POST } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 404 when no profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { id: 'user_123' },
      profile: null,
    });

    const { POST } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('creates conversation and returns 201', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { id: 'user_123' },
      profile: { id: 'profile_123' },
    });
    // Mock count query — returns under limit
    hoisted.selectFromMock.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue([{ value: 5 }]),
    });
    hoisted.insertReturningMock.mockResolvedValue([
      { id: 'conv_new', title: null },
    ]);

    const { POST } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My conversation' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('returns 403 when conversation limit reached', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { id: 'user_123' },
      profile: { id: 'profile_123' },
    });
    // Mock count query — at limit
    hoisted.selectFromMock.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue([{ value: 200 }]),
    });

    const { POST } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('returns 400 when initial message is too long', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { id: 'user_123' },
      profile: { id: 'profile_123' },
    });
    hoisted.selectFromMock.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue([{ value: 0 }]),
    });

    const { POST } = await import('@/app/api/chat/conversations/route');
    const request = new Request('http://localhost/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialMessage: 'x'.repeat(4001) }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

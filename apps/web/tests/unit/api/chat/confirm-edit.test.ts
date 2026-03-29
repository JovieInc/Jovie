import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateWhereMock: vi.fn().mockResolvedValue(undefined),
  updateSetMock: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  updateMock: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  insertValuesMock: vi.fn().mockResolvedValue(undefined),
  insertMock: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      creatorProfiles: {
        findFirst: hoisted.findFirstMock,
      },
    },
    update: hoisted.updateMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId', displayName: 'displayName', bio: 'bio' },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_CACHE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('POST /api/chat/confirm-edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid schema', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'invalid_field', newValue: 'test' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 404 when profile not found', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-8000-000000000001',
        field: 'displayName',
        newValue: 'New Name',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('returns 403 when profile belongs to another user', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      userId: 'other_user',
      displayName: 'Old Name',
      bio: null,
    });

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-8000-000000000001',
        field: 'displayName',
        newValue: 'New Name',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('successfully applies edit and returns success', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      userId: 'user_123',
      displayName: 'Old Name',
      bio: null,
    });

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-8000-000000000001',
        field: 'displayName',
        newValue: 'New Name',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.field).toBe('displayName');
    expect(body.newValue).toBe('New Name');
  });

  it('returns 500 on DB error and reports to Sentry', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockRejectedValue(new Error('DB connection failed'));

    const { POST } = await import('@/app/api/chat/confirm-edit/route');
    const request = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'a0000000-0000-4000-8000-000000000001',
        field: 'bio',
        newValue: 'New bio text',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});

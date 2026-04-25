import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  getOwnedChatProfileMock: vi.fn(),
  updateWhereMock: vi.fn().mockResolvedValue(undefined),
  updateMock: vi.fn().mockReturnValue({
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
  insertMock: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
}));

vi.mock('@/lib/chat/profile-ownership', () => ({
  getOwnedChatProfile: hoisted.getOwnedChatProfileMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.updateMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'displayName',
    bio: 'bio',
  },
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

  it('returns 404 when the Clerk user does not own the profile', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getOwnedChatProfileMock.mockResolvedValue(null);

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
    expect(hoisted.getOwnedChatProfileMock).toHaveBeenCalledWith({
      profileId: 'a0000000-0000-4000-8000-000000000001',
      clerkUserId: 'user_123',
    });
  });

  it('writes audit rows with the internal user id, not the Clerk user id', async () => {
    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getOwnedChatProfileMock.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      internalUserId: 'internal_user_1',
      displayName: 'Old Name',
      bio: null,
      username: 'artist',
    });
    hoisted.insertMock.mockReturnValue({ values: insertValuesMock });

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
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'internal_user_1',
        creatorProfileId: 'a0000000-0000-4000-8000-000000000001',
      })
    );
  });

  it('returns 500 on DB error and reports to Sentry', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getOwnedChatProfileMock.mockRejectedValue(
      new Error('DB connection failed')
    );

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

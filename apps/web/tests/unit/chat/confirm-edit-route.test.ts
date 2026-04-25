import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getOwnedChatProfileMock: vi.fn(),
  updateWhereMock: vi.fn().mockResolvedValue(undefined),
  updateSetMock: vi.fn(),
  updateMock: vi.fn(),
  insertValuesMock: vi.fn().mockResolvedValue(undefined),
  insertMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
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

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: { table: 'chatAuditLog' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'displayName',
    bio: 'bio',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/http/headers', () => ({
  NO_CACHE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/chat/confirm-edit/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat/confirm-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/confirm-edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_abc' });
    hoisted.getOwnedChatProfileMock.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      internalUserId: 'internal_user_1',
      displayName: 'Old Name',
      bio: 'Old bio',
      username: 'artist',
    });

    hoisted.updateSetMock.mockReturnValue({
      where: hoisted.updateWhereMock,
    });
    hoisted.updateMock.mockReturnValue({
      set: hoisted.updateSetMock,
    });
    hoisted.insertMock.mockReturnValue({
      values: hoisted.insertValuesMock,
    });
  });

  it('returns 401 when not authenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'New Name',
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await POST(
      makeRequest({ profileId: '550e8400-e29b-41d4-a716-446655440000' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 for invalid field name', async () => {
    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'username',
        newValue: 'hacker',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 for non-UUID profileId', async () => {
    const res = await POST(
      makeRequest({
        profileId: 'not-a-uuid',
        field: 'displayName',
        newValue: 'Name',
      })
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when profile is not found', async () => {
    hoisted.getOwnedChatProfileMock.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'New Name',
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Profile not found');
  });

  it('returns 404 when profile belongs to a different user', async () => {
    hoisted.getOwnedChatProfileMock.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'Hijacked Name',
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Profile not found');
  });

  it('returns 200 and updates displayName in database', async () => {
    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'New Name',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      field: 'displayName',
      newValue: 'New Name',
    });
    expect(hoisted.updateMock).toHaveBeenCalled();
  });

  it('returns 200 and updates bio in database', async () => {
    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'bio',
        newValue: 'My updated bio text',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      field: 'bio',
      newValue: 'My updated bio text',
    });
  });

  it('creates an audit log entry with the internal user id', async () => {
    await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'New Name',
      })
    );

    expect(hoisted.insertMock).toHaveBeenCalled();
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'internal_user_1',
        creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'profile_edit',
        field: 'displayName',
        previousValue: JSON.stringify('Old Name'),
        newValue: JSON.stringify('New Name'),
      })
    );
  });

  it('returns 500 when database operation fails', async () => {
    hoisted.updateSetMock.mockReturnValueOnce({
      where: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });

    const res = await POST(
      makeRequest({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        field: 'displayName',
        newValue: 'New Name',
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to apply edit');
  });
});

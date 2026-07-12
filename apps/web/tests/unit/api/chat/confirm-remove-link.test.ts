import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return {
    authMock: vi.fn(),
    findFirstMock: vi.fn(),
    selectMock,
    selectFromMock,
    selectWhereMock,
    selectLimitMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    insertMock,
    insertValuesMock,
    syncPrimaryMusicUrlsFromSocialLinksMock: vi
      .fn()
      .mockResolvedValue(undefined),
    captureExceptionMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.authMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      creatorProfiles: {
        findFirst: hoisted.findFirstMock,
      },
    },
    select: hoisted.selectMock,
    update: hoisted.updateMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {},
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    platform: 'platform',
    url: 'url',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/db/social-links-sync', () => ({
  syncPrimaryMusicUrlsFromSocialLinks:
    hoisted.syncPrimaryMusicUrlsFromSocialLinksMock,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
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

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000001';
const LINK_ID = 'b0000000-0000-4000-8000-000000000002';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    profileId: PROFILE_ID,
    linkId: LINK_ID,
    ...overrides,
  };
}

function confirmRemoveLinkRequest(body: unknown) {
  return new Request('http://localhost/api/chat/confirm-remove-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/chat/confirm-remove-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findFirstMock.mockReset();
    hoisted.selectLimitMock.mockReset();
    hoisted.syncPrimaryMusicUrlsFromSocialLinksMock.mockResolvedValue(
      undefined
    );
  });

  it('returns 401 when unauthenticated, without touching the database', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(hoisted.findFirstMock).not.toHaveBeenCalled();
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest('not json'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON body');
    expect(hoisted.findFirstMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid schema (non-uuid linkId)', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(
      confirmRemoveLinkRequest({ profileId: PROFILE_ID, linkId: 'not-a-uuid' })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
    expect(hoisted.findFirstMock).not.toHaveBeenCalled();
  });

  it('returns 404 when profile not found', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Profile not found');
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the profile belongs to another user', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue({
      id: PROFILE_ID,
      userId: 'other_user',
    });

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized - not your profile');
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the link is not found on the profile', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue({
      id: PROFILE_ID,
      userId: 'user_123',
    });
    hoisted.selectLimitMock.mockResolvedValueOnce([]);

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Link not found');
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('soft-deletes the link and returns success', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockResolvedValue({
      id: PROFILE_ID,
      userId: 'user_123',
    });
    hoisted.selectLimitMock.mockResolvedValueOnce([
      { id: LINK_ID, platform: 'instagram', url: 'https://instagram.com/x' },
    ]);

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('instagram');

    // Soft delete: state flips to 'rejected' and isActive to false, no hard delete.
    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'rejected', isActive: false })
    );
    expect(
      hoisted.syncPrimaryMusicUrlsFromSocialLinksMock
    ).toHaveBeenCalledWith(expect.anything(), PROFILE_ID);
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        creatorProfileId: PROFILE_ID,
        action: 'remove_social_link',
      })
    );
  });

  it('returns 500 on DB error and reports to Sentry', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.findFirstMock.mockRejectedValue(new Error('DB connection failed'));

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const response = await POST(confirmRemoveLinkRequest(validBody()));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to remove link');
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});

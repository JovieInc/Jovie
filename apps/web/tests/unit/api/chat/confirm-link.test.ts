import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectLeftJoinMock = vi
    .fn()
    .mockReturnValue({ where: selectWhereMock });
  const selectFromMock = vi.fn().mockReturnValue({
    leftJoin: selectLeftJoinMock,
    where: selectWhereMock,
  });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const insertReturningMock = vi.fn();
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return {
    authMock: vi.fn(),
    selectMock,
    selectFromMock,
    selectLeftJoinMock,
    selectWhereMock,
    selectLimitMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    insertMock,
    insertValuesMock,
    insertReturningMock,
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
    select: hoisted.selectMock,
    update: hoisted.updateMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {},
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    platform: 'platform',
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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    profileId: PROFILE_ID,
    platform: 'instagram',
    url: 'https://instagram.com/testartist',
    normalizedUrl: 'https://instagram.com/testartist',
    ...overrides,
  };
}

function confirmLinkRequest(body: unknown) {
  return new Request('http://localhost/api/chat/confirm-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/chat/confirm-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectLimitMock.mockReset();
    hoisted.insertReturningMock.mockReset();
    hoisted.syncPrimaryMusicUrlsFromSocialLinksMock.mockResolvedValue(
      undefined
    );
  });

  it('returns 401 when unauthenticated, without touching the database', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(hoisted.selectMock).not.toHaveBeenCalled();
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest('not json'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON body');
    expect(hoisted.selectMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid schema (missing url fields)', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(
      confirmLinkRequest({ profileId: PROFILE_ID, platform: 'instagram' })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
    expect(hoisted.selectMock).not.toHaveBeenCalled();
  });

  it('returns 404 when profile not found', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.selectLimitMock.mockResolvedValueOnce([]);

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Profile not found');
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the profile belongs to another user', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.selectLimitMock.mockResolvedValueOnce([
      { id: PROFILE_ID, internalUserId: 'internal-1', clerkId: 'other_user' },
    ]);

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized - not your profile');
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('creates a new social link and returns success', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.selectLimitMock
      .mockResolvedValueOnce([
        { id: PROFILE_ID, internalUserId: 'internal-1', clerkId: 'user_123' },
      ]) // profile ownership join
      .mockResolvedValueOnce([]); // no existing link with this platform
    hoisted.insertReturningMock.mockResolvedValueOnce([{ id: 'link-uuid-1' }]);

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.platform).toBe('instagram');
    expect(body.linkId).toBe('link-uuid-1');

    // Insert path taken, not update.
    expect(hoisted.updateMock).not.toHaveBeenCalled();
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: PROFILE_ID,
        platform: 'instagram',
        isActive: true,
        state: 'active',
      })
    );
    expect(
      hoisted.syncPrimaryMusicUrlsFromSocialLinksMock
    ).toHaveBeenCalledWith(expect.anything(), PROFILE_ID);
  });

  it('updates an existing link instead of inserting a duplicate', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.selectLimitMock
      .mockResolvedValueOnce([
        { id: PROFILE_ID, internalUserId: 'internal-1', clerkId: 'user_123' },
      ])
      .mockResolvedValueOnce([{ id: 'existing-link-1' }]);

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.linkId).toBe('existing-link-1');

    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, state: 'active' })
    );
    // No new social link row created — the audit-log insert is the only
    // `db.insert` call in the update-existing-link branch.
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 on DB error and reports to Sentry', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.selectLimitMock.mockRejectedValueOnce(
      new Error('DB connection failed')
    );

    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const response = await POST(confirmLinkRequest(validBody()));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to add link');
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});

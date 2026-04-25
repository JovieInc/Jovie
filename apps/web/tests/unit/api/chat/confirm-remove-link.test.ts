import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  getOwnedChatProfileMock: vi.fn(),
  selectLimitMock: vi.fn(),
  selectWhereMock: vi.fn().mockReturnValue({ limit: vi.fn() }),
  selectMock: vi.fn(),
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
    platform: 'platform',
    url: 'url',
    creatorProfileId: 'creatorProfileId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/db/social-links-sync', () => ({
  syncPrimaryMusicUrlsFromSocialLinks: vi.fn().mockResolvedValue(undefined),
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

describe('POST /api/chat/confirm-remove-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const limitMock = vi.fn();
    hoisted.selectWhereMock.mockReturnValue({ limit: limitMock });
    hoisted.selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: hoisted.selectWhereMock }),
    });
    limitMock.mockResolvedValue([
      {
        id: 'link_1',
        platform: 'instagram',
        url: 'https://instagram.com/artist',
      },
    ]);
  });

  it('returns 404 when the Clerk user does not own the profile', async () => {
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getOwnedChatProfileMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const request = new Request(
      'http://localhost/api/chat/confirm-remove-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: 'a0000000-0000-4000-8000-000000000001',
          linkId: 'a0000000-0000-4000-8000-000000000002',
        }),
      }
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('writes audit rows with the internal user id', async () => {
    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getOwnedChatProfileMock.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      internalUserId: 'internal_user_1',
      displayName: 'Artist',
      bio: null,
      username: 'artist',
    });
    hoisted.insertMock.mockReturnValue({ values: insertValuesMock });

    const { POST } = await import('@/app/api/chat/confirm-remove-link/route');
    const request = new Request(
      'http://localhost/api/chat/confirm-remove-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: 'a0000000-0000-4000-8000-000000000001',
          linkId: 'a0000000-0000-4000-8000-000000000002',
        }),
      }
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'internal_user_1',
        creatorProfileId: 'a0000000-0000-4000-8000-000000000001',
      })
    );
  });
});

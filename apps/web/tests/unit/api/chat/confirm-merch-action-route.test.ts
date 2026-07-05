import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  findFirstMock: vi.fn(),
  publishMerchCardMock: vi.fn(),
  updateMerchCardStatusMock: vi.fn(),
  insertValuesMock: vi.fn().mockResolvedValue(undefined),
  insertMock: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
}));

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
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {},
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

vi.mock('@/lib/merch/service', () => ({
  publishMerchCard: hoisted.publishMerchCardMock,
  updateMerchCardStatus: hoisted.updateMerchCardStatusMock,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/http/headers', () => ({
  NO_CACHE_HEADERS: { 'Cache-Control': 'no-store' },
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

describe('POST /api/chat/confirm-merch-action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ userId: 'user-1' });
    hoisted.findFirstMock.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
    });
    hoisted.publishMerchCardMock.mockResolvedValue({
      id: 'card-1',
      status: 'live',
      title: 'Tour Tee',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          merchCardId: '00000000-0000-4000-8000-000000000002',
          action: 'publish',
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  it('publishes merch after ownership check', async () => {
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          merchCardId: '00000000-0000-4000-8000-000000000002',
          action: 'publish',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(hoisted.publishMerchCardMock).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.status).toBe('live');
  });
});

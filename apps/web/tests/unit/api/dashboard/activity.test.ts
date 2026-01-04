import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  audienceMembers: {},
  clickEvents: {},
  notificationSubscriptions: {},
  users: {},
}));

describe('GET /api/dashboard/activity/recent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      throw new Error('Unauthorized');
    });

    const { GET } = await import('@/app/api/dashboard/activity/recent/route');
    const request = new NextRequest(
      'http://localhost/api/dashboard/activity/recent?profileId=profile_123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns recent activity for authenticated user', async () => {
    const profileId = '00000000-0000-4000-8000-000000000001';
    mockWithDbSession.mockImplementation(async callback => {
      return callback('user_123');
    });
    mockDbSelect.mockImplementation(() => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi
        .fn()
        .mockReturnValue({ orderBy: orderByFn, limit: limitFn });

      const profileLimitFn = vi.fn().mockResolvedValue([{ id: profileId }]);
      const innerJoinFn = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: profileLimitFn,
        }),
      });
      const leftJoinFn = vi.fn().mockReturnValue({ where: whereFn });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin: innerJoinFn,
          leftJoin: leftJoinFn,
          where: whereFn,
          orderBy: orderByFn,
          limit: limitFn,
        }),
      };
    });

    const { GET } = await import('@/app/api/dashboard/activity/recent/route');
    const request = new NextRequest(
      `http://localhost/api/dashboard/activity/recent?profileId=${profileId}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.activities).toBeDefined();
  });
});

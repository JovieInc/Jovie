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
    mockWithDbSession.mockImplementation(async callback => {
      return callback('user_123');
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'profile_123' }]),
          }),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/dashboard/activity/recent/route');
    const request = new NextRequest(
      'http://localhost/api/dashboard/activity/recent?profileId=profile_123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.activities).toBeDefined();
  });
});

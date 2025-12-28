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
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  getAnalyticsSummary: vi.fn().mockResolvedValue({
    totalVisits: 1000,
    totalClicks: 500,
    uniqueVisitors: 300,
  }),
}));

describe('GET /api/dashboard/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns analytics data for authenticated user', async () => {
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
      }),
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.analytics).toBeDefined();
  });
});

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
  users: {},
}));

describe('GET /api/dashboard/audience/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    });

    const { GET } = await import('@/app/api/dashboard/audience/members/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns audience members for authenticated user', async () => {
    mockWithDbSession.mockImplementation(async callback => {
      return callback('user_123');
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([
                  { id: 'member_1', displayName: 'Visitor 1', visits: 5 },
                ]),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/dashboard/audience/members/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toBeDefined();
  });
});

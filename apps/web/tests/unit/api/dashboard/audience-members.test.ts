import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSessionTx = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
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
    mockWithDbSessionTx.mockImplementation(async () => {
      throw new Error('Unauthorized');
    });

    const { GET } = await import('@/app/api/dashboard/audience/members/route');
    const request = new NextRequest(
      'http://localhost/api/dashboard/audience/members?profileId=profile_123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid request', async () => {
    mockWithDbSessionTx.mockImplementation(async callback => {
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
      return callback(mockTx, 'user_123');
    });

    const { GET } = await import('@/app/api/dashboard/audience/members/route');
    const request = new NextRequest(
      'http://localhost/api/dashboard/audience/members'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid audience request');
  });
});

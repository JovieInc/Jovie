import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  notificationSubscriptions: {},
  users: {},
}));

describe('GET /api/dashboard/audience/subscribers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      throw new Error('Unauthorized');
    });

    const { GET } = await import(
      '@/app/api/dashboard/audience/subscribers/route'
    );
    const request = new NextRequest(
      'http://localhost/api/dashboard/audience/subscribers?profileId=profile_123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

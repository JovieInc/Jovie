import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn(),
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  users: {},
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
}));

const mockVerifyProfileOwnership = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: mockVerifyProfileOwnership,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn().mockImplementation(async request => {
    const body = await request.json();
    return { ok: true, data: body };
  }),
}));

describe('POST /api/artist/theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      throw new Error('Unauthorized');
    });

    const { POST } = await import('@/app/api/artist/theme/route');
    const request = new NextRequest('http://localhost/api/artist/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: 'artist_123', theme: 'dark' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when missing required fields', async () => {
    const { POST } = await import('@/app/api/artist/theme/route');
    const request = new NextRequest('http://localhost/api/artist/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });

  it('updates theme successfully', async () => {
    mockWithDbSession.mockImplementation(async callback => {
      return callback('user_123');
    });

    mockVerifyProfileOwnership.mockResolvedValue({
      id: 'artist_123',
      usernameNormalized: 'testuser',
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { theme: { mode: 'dark' }, usernameNormalized: 'testuser' },
            ]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/artist/theme/route');
    const request = new NextRequest('http://localhost/api/artist/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: 'artist_123', theme: 'dark' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

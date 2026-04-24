import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    theme: 'theme',
    usernameNormalized: 'usernameNormalized',
  },
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

  function createSelectChain(result: unknown[] = []) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
    };
    mockDbSelect.mockReturnValue(chain);
    return chain;
  }

  function createUpdateChain(result: unknown[] = []) {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(result),
    };
    mockDbUpdate.mockReturnValue(chain);
    return chain;
  }

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

    createSelectChain([
      {
        theme: {
          profileAccent: {
            version: 1,
            primaryHex: '#d3834e',
            sourceUrl: 'https://example.com/avatar.jpg',
          },
        },
      },
    ]);
    const updateChain = createUpdateChain([
      {
        theme: {
          mode: 'dark',
          profileAccent: {
            version: 1,
            primaryHex: '#d3834e',
            sourceUrl: 'https://example.com/avatar.jpg',
          },
        },
        usernameNormalized: 'testuser',
      },
    ]);

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
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: {
          mode: 'dark',
          profileAccent: {
            version: 1,
            primaryHex: '#d3834e',
            sourceUrl: 'https://example.com/avatar.jpg',
          },
        },
      })
    );
  });
});

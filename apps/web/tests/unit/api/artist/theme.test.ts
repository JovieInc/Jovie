import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  users: {},
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
}));

describe('Artist Theme API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('GET /api/artist/theme', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/artist/theme/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns theme settings for authenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  theme: 'dark',
                  primaryColor: '#FF5500',
                },
              ]),
            }),
          }),
        }),
      });

      const { GET } = await import('@/app/api/artist/theme/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.theme).toBeDefined();
    });
  });

  describe('PUT /api/artist/theme', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { PUT } = await import('@/app/api/artist/theme/route');
      const request = new NextRequest('http://localhost/api/artist/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'dark' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('updates theme successfully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'profile_123' }]),
            }),
          }),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                theme: 'dark',
                primaryColor: '#FF5500',
              },
            ]),
          }),
        }),
      });

      const { PUT } = await import('@/app/api/artist/theme/route');
      const request = new NextRequest('http://localhost/api/artist/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'dark', primaryColor: '#FF5500' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.theme).toBe('dark');
    });
  });
});

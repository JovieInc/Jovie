import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  socialLinks: {},
  creatorProfiles: {},
}));

describe('Admin Creator Social Links API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('GET /api/admin/creator-social-links', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import(
        '@/app/api/admin/creator-social-links/route'
      );
      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockIsAdmin.mockResolvedValue(false);

      const { GET } = await import(
        '@/app/api/admin/creator-social-links/route'
      );
      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('returns social links for admins', async () => {
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockIsAdmin.mockResolvedValue(true);
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'link_1',
              platform: 'instagram',
              url: 'https://instagram.com/test',
            },
          ]),
        }),
      });

      const { GET } = await import(
        '@/app/api/admin/creator-social-links/route'
      );
      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.links).toBeDefined();
    });
  });
});

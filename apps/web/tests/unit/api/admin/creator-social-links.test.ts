import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Import after mocks are set up
import { GET } from '@/app/api/admin/creator-social-links/route';

describe('Admin Creator Social Links API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/creator-social-links', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: null,
        email: null,
        isAuthenticated: false,
        isAdmin: false,
        isPro: false,
        hasAdvancedFeatures: false,
        canRemoveBranding: false,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not admin', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'user_123',
        email: 'user@example.com',
        isAuthenticated: true,
        isAdmin: false,
        isPro: false,
        hasAdvancedFeatures: false,
        canRemoveBranding: false,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('returns social links for admins', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 'link_1',
                label: 'Instagram',
                platform: 'instagram',
                platformType: 'social',
                url: 'https://instagram.com/test',
              },
            ]),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links?profileId=profile_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.links)).toBe(true);
    });
  });
});

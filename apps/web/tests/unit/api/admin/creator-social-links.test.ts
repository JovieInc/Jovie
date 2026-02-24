import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockWithIdempotency = vi.hoisted(() => vi.fn());
const mockBatchUpdateSocialLinks = vi.hoisted(() => vi.fn());
const mockInvalidateSocialLinksCache = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/batch', () => ({
  batchUpdateSocialLinks: mockBatchUpdateSocialLinks,
}));

vi.mock('@/lib/cache', () => ({
  invalidateSocialLinksCache: mockInvalidateSocialLinksCache,
}));

vi.mock('@/lib/idempotency', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/idempotency')>(
      '@/lib/idempotency'
    );
  return {
    ...actual,
    withIdempotency: mockWithIdempotency,
  };
});

// Import after mocks are set up
import { GET, PUT } from '@/app/api/admin/creator-social-links/route';

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

  describe('PUT /api/admin/creator-social-links', () => {
    it('uses a 45-second lock TTL to prevent overlapping updates', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });

      const profileId = '123e4567-e89b-12d3-a456-426614174000';
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([
                  { id: profileId, usernameNormalized: 'artist' },
                ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      mockDbDelete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
      mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
      mockWithIdempotency.mockImplementation(async (_key, _ttl, fn) => fn());

      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, links: [] }),
        }
      );

      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(mockWithIdempotency).toHaveBeenCalledWith(
        `admin-social-links:${profileId}`,
        45,
        expect.any(Function)
      );
      expect(mockInvalidateSocialLinksCache).toHaveBeenCalledOnce();
    });

    it('returns 409 when another update is in progress', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });

      const profileId = '123e4567-e89b-12d3-a456-426614174000';
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { id: profileId, usernameNormalized: 'artist' },
              ]),
          }),
        }),
      });

      const { IdempotencyError } = await import('@/lib/idempotency');
      mockWithIdempotency.mockRejectedValue(
        new IdempotencyError(
          'This action is already in progress. Please wait.',
          'lock'
        )
      );

      const request = new NextRequest(
        'http://localhost/api/admin/creator-social-links',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, links: [] }),
        }
      );

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe(
        'This action is already in progress. Please wait.'
      );
    });
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAvatarFetching } from '@/app/api/admin/creator-ingest/ingest-avatars';
import { validateIngestRequest } from '@/app/api/admin/creator-ingest/ingest-validation';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

describe('creator ingest helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateIngestRequest', () => {
    it('returns unauthorized response when user is not authenticated', async () => {
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
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://linktr.ee/test' }),
        }
      );

      const result = await validateIngestRequest(request);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
      }
    });

    it('returns parsed url when request is valid', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://linktr.ee/test' }),
        }
      );

      const result = await validateIngestRequest(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.url).toBe('https://linktr.ee/test');
      }
    });

    it('returns validation error when request body is invalid', async () => {
      mockGetCurrentUserEntitlements.mockResolvedValue({
        userId: 'admin_123',
        email: 'admin@example.com',
        isAuthenticated: true,
        isAdmin: true,
        isPro: true,
        hasAdvancedFeatures: true,
        canRemoveBranding: true,
      });

      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 123 }),
        }
      );

      const result = await validateIngestRequest(request);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
      }
    });
  });

  describe('handleAvatarFetching', () => {
    it('prefers copied avatar and skips link fallback', async () => {
      const copyAvatarToBlob = vi
        .fn()
        .mockResolvedValue('https://cdn.jovie.test/avatar.avif');
      const copyAvatarFromLinks = vi
        .fn()
        .mockResolvedValue('https://cdn.jovie.test/link-avatar.avif');

      const extraction = {
        avatarUrl: 'https://images.example.com/avatar.png',
        links: [{ url: 'https://example.com' }],
      };

      const result = await handleAvatarFetching(extraction, 'test-handle', {
        copyAvatarToBlob,
        copyAvatarFromLinks,
      });

      expect(result.hostedAvatarUrl).toBe('https://cdn.jovie.test/avatar.avif');
      expect(result.extractionWithHostedAvatar.avatarUrl).toBe(
        'https://cdn.jovie.test/avatar.avif'
      );
      expect(copyAvatarFromLinks).not.toHaveBeenCalled();
    });

    it('falls back to link avatar when profile copy fails', async () => {
      const copyAvatarToBlob = vi.fn().mockResolvedValue(null);
      const copyAvatarFromLinks = vi
        .fn()
        .mockResolvedValue('https://cdn.jovie.test/link-avatar.avif');

      const extraction = {
        avatarUrl: 'https://images.example.com/avatar.png',
        links: [{ url: 'https://example.com' }],
      };

      const result = await handleAvatarFetching(extraction, 'test-handle', {
        copyAvatarToBlob,
        copyAvatarFromLinks,
      });

      expect(copyAvatarFromLinks).toHaveBeenCalledWith({
        handle: 'test-handle',
        links: ['https://example.com'],
      });
      expect(result.hostedAvatarUrl).toBe(
        'https://cdn.jovie.test/link-avatar.avif'
      );
      expect(result.extractionWithHostedAvatar.avatarUrl).toBe(
        'https://cdn.jovie.test/link-avatar.avif'
      );
    });
  });
});

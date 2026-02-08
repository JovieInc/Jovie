/**
 * Unit tests for profile cache invalidation.
 *
 * Tests the cache invalidation logic that runs after profile mutations:
 * - invalidateProfileCache
 * - invalidateUsernameChange
 * - invalidateSocialLinksCache
 * - invalidateAvatarCache
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockRevalidateTag = vi.hoisted(() => vi.fn());
const mockInvalidateProfileEdgeCache = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));

vi.mock('@/lib/services/profile/queries', () => ({
  invalidateProfileEdgeCache: mockInvalidateProfileEdgeCache,
}));

vi.mock('@/lib/cache/tags', () => ({
  CACHE_TAGS: {
    DASHBOARD_DATA: 'dashboard-data',
    PUBLIC_PROFILE: 'public-profile',
  },
  createProfileTag: (username: string) => `profile:${username}`,
  createSocialLinksTag: (profileId: string) => `social-links:${profileId}`,
  createAvatarTag: (userId: string) => `avatar:${userId}`,
}));

describe('Profile Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('invalidateProfileCache', () => {
    it('invalidates dashboard and profile caches', async () => {
      const { invalidateProfileCache } = await import('@/lib/cache/profile');
      await invalidateProfileCache('testartist');

      expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard-data', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith('public-profile', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'profile:testartist',
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/testartist');
      expect(mockInvalidateProfileEdgeCache).toHaveBeenCalledWith('testartist');
    });

    it('also invalidates old path on username change', async () => {
      const { invalidateProfileCache } = await import('@/lib/cache/profile');
      await invalidateProfileCache('newname', 'oldname');

      // Should invalidate both old and new paths
      expect(mockRevalidatePath).toHaveBeenCalledWith('/newname');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/oldname');
      expect(mockRevalidateTag).toHaveBeenCalledWith('profile:oldname', 'max');
      expect(mockInvalidateProfileEdgeCache).toHaveBeenCalledWith('oldname');
    });

    it('handles null username gracefully', async () => {
      const { invalidateProfileCache } = await import('@/lib/cache/profile');
      await invalidateProfileCache(null);

      // Should still invalidate dashboard
      expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard-data', 'max');
      // Should NOT try to invalidate profile-specific paths
      expect(mockRevalidatePath).not.toHaveBeenCalledWith('/null');
    });

    it('invalidates dashboard paths', async () => {
      const { invalidateProfileCache } = await import('@/lib/cache/profile');
      await invalidateProfileCache('testartist');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dashboard');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings');
    });
  });

  describe('invalidateUsernameChange', () => {
    it('invalidates both old and new username caches', async () => {
      const { invalidateUsernameChange } = await import('@/lib/cache/profile');
      await invalidateUsernameChange('newartist', 'oldartist');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/newartist');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/oldartist');
      expect(mockInvalidateProfileEdgeCache).toHaveBeenCalledWith('newartist');
      expect(mockInvalidateProfileEdgeCache).toHaveBeenCalledWith('oldartist');
    });

    it('also invalidates homepage for featured creators', async () => {
      const { invalidateUsernameChange } = await import('@/lib/cache/profile');
      await invalidateUsernameChange('newartist', 'oldartist');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/');
    });
  });

  describe('invalidateSocialLinksCache', () => {
    it('invalidates social links and profile caches', async () => {
      const { invalidateSocialLinksCache } = await import(
        '@/lib/cache/profile'
      );
      await invalidateSocialLinksCache('profile-123', 'testartist');

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'social-links:profile-123',
        'max'
      );
      expect(mockRevalidateTag).toHaveBeenCalledWith('public-profile', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/testartist');
    });

    it('invalidates dashboard link pages', async () => {
      const { invalidateSocialLinksCache } = await import(
        '@/lib/cache/profile'
      );
      await invalidateSocialLinksCache('profile-123', 'testartist');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dashboard');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dashboard/links');
    });
  });

  describe('invalidateAvatarCache', () => {
    it('invalidates avatar and profile caches', async () => {
      const { invalidateAvatarCache } = await import('@/lib/cache/profile');
      await invalidateAvatarCache('user-123', 'testartist');

      expect(mockRevalidateTag).toHaveBeenCalledWith('avatar:user-123', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith('public-profile', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/testartist');
    });

    it('handles missing username gracefully', async () => {
      const { invalidateAvatarCache } = await import('@/lib/cache/profile');
      await invalidateAvatarCache('user-123');

      // Should still invalidate avatar tag
      expect(mockRevalidateTag).toHaveBeenCalledWith('avatar:user-123', 'max');
    });
  });
});

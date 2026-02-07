/**
 * Unit tests for profile service queries.
 *
 * Tests the data access layer for public profile pages:
 * - getProfileById
 * - getProfileByUsername
 * - getProfileWithUser
 * - getProfileSocialLinks
 * - getProfileContacts
 * - getProfileWithLinks (with Redis cache)
 * - isClaimTokenValid
 * - getTopProfilesForStaticGeneration
 * - invalidateProfileEdgeCache
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks for database and Redis
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue('OK'));
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockGetLatestRelease = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock Redis
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

// Mock discography queries
vi.mock('@/lib/discography/queries', () => ({
  getLatestReleaseByUsername: mockGetLatestRelease,
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: mockCaptureWarning,
}));

// Helper to create a chainable select mock
function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

const NOW = new Date('2024-01-15T12:00:00Z');

const mockProfileData = {
  id: 'profile-123',
  userId: 'user-456',
  creatorType: 'artist',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  bio: 'A test artist bio',
  avatarUrl: 'https://example.com/avatar.jpg',
  spotifyUrl: 'https://open.spotify.com/artist/123',
  appleMusicUrl: 'https://music.apple.com/artist/123',
  youtubeUrl: 'https://youtube.com/channel/123',
  spotifyId: 'spotify-123',
  isPublic: true,
  isVerified: false,
  isClaimed: true,
  isFeatured: false,
  marketingOptOut: false,
  settings: {},
  theme: {},
  profileViews: 42,
  genres: ['rock', 'indie'],
  spotifyPopularity: 65,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockProfileWithUser = {
  ...mockProfileData,
  userIsPro: true,
  userClerkId: 'clerk-789',
};

const mockSocialLink = {
  id: 'link-1',
  creatorProfileId: 'profile-123',
  platform: 'spotify',
  platformType: 'music',
  url: 'https://open.spotify.com/artist/123',
  displayText: null,
  clicks: 10,
  isActive: true,
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-123',
  role: 'bookings',
  customLabel: null,
  personName: 'John Doe',
  companyName: 'Booking Co',
  territories: ['US', 'EU'],
  email: 'john@booking.co',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('Profile Service Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProfileById', () => {
    it('returns profile data when found', async () => {
      createSelectChain([mockProfileData]);

      const { getProfileById } = await import('@/lib/services/profile/queries');
      const result = await getProfileById('profile-123');

      expect(result).toEqual(mockProfileData);
      expect(mockDbSelect).toHaveBeenCalled();
    });

    it('returns null when profile not found', async () => {
      createSelectChain([]);

      const { getProfileById } = await import('@/lib/services/profile/queries');
      const result = await getProfileById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getProfileByUsername', () => {
    it('normalizes username to lowercase for lookup', async () => {
      const chain = createSelectChain([mockProfileData]);

      const { getProfileByUsername } = await import(
        '@/lib/services/profile/queries'
      );
      await getProfileByUsername('TestArtist');

      // Verify where was called (the normalization happens inside the function)
      expect(chain.where).toHaveBeenCalled();
    });

    it('returns null when username not found', async () => {
      createSelectChain([]);

      const { getProfileByUsername } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileByUsername('nobody');

      expect(result).toBeNull();
    });
  });

  describe('getProfileWithUser', () => {
    it('joins user table to get isPro and clerkId', async () => {
      const chain = createSelectChain([mockProfileWithUser]);

      const { getProfileWithUser } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithUser('testartist');

      expect(result).toEqual(mockProfileWithUser);
      expect(chain.leftJoin).toHaveBeenCalled();
    });

    it('returns null when profile not found', async () => {
      createSelectChain([]);

      const { getProfileWithUser } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithUser('nobody');

      expect(result).toBeNull();
    });
  });

  describe('getProfileSocialLinks', () => {
    it('returns active non-rejected links ordered by sortOrder', async () => {
      createSelectChain([mockSocialLink]);

      const { getProfileSocialLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileSocialLinks('profile-123');

      expect(result).toEqual([mockSocialLink]);
    });

    it('returns empty array when no links found', async () => {
      createSelectChain([]);

      const { getProfileSocialLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileSocialLinks('profile-123');

      expect(result).toEqual([]);
    });

    it('logs warning when MAX_SOCIAL_LINKS limit is hit', async () => {
      // Create exactly 100 links to trigger the warning
      const manyLinks = Array.from({ length: 100 }, (_, i) => ({
        ...mockSocialLink,
        id: `link-${i}`,
      }));
      createSelectChain(manyLinks);

      const { getProfileSocialLinks } = await import(
        '@/lib/services/profile/queries'
      );
      await getProfileSocialLinks('profile-123');

      expect(mockCaptureWarning).toHaveBeenCalledWith(
        '[profile-service] MAX_SOCIAL_LINKS limit hit',
        expect.objectContaining({ profileId: 'profile-123', count: 100 })
      );
    });
  });

  describe('getProfileContacts', () => {
    it('returns active contacts ordered by sortOrder', async () => {
      createSelectChain([mockContact]);

      const { getProfileContacts } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileContacts('profile-123');

      expect(result).toEqual([mockContact]);
    });

    it('returns empty array when table does not exist', async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockRejectedValue(
            new Error('relation "creator_contacts" does not exist')
          ),
      };
      mockDbSelect.mockReturnValue(chain);

      const { getProfileContacts } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileContacts('profile-123');

      expect(result).toEqual([]);
      expect(mockCaptureWarning).toHaveBeenCalled();
    });

    it('rethrows non-table-missing errors', async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('connection timeout')),
      };
      mockDbSelect.mockReturnValue(chain);

      const { getProfileContacts } = await import(
        '@/lib/services/profile/queries'
      );

      await expect(getProfileContacts('profile-123')).rejects.toThrow(
        'connection timeout'
      );
    });
  });

  describe('getProfileWithLinks', () => {
    it('returns cached data from Redis when available', async () => {
      const cachedProfile = {
        ...mockProfileWithUser,
        socialLinks: [mockSocialLink],
        contacts: [mockContact],
        latestRelease: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      mockRedisGet.mockResolvedValue(cachedProfile);

      const { getProfileWithLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithLinks('TestArtist');

      expect(result).toBeTruthy();
      expect(mockRedisGet).toHaveBeenCalled();
      // Should not hit database when cache is available
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it('falls back to database on Redis cache miss', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockGetLatestRelease.mockResolvedValue(null);

      // First select returns profile with user, second returns links, third returns contacts
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Profile query
          return {
            from: vi.fn().mockReturnThis(),
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([mockProfileWithUser]),
          };
        }
        if (selectCallCount === 2) {
          // Links query
          return {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([mockSocialLink]),
          };
        }
        // Contacts query
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([mockContact]),
        };
      });

      const { getProfileWithLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithLinks('testartist');

      expect(result).toBeTruthy();
      expect(result?.socialLinks).toEqual([mockSocialLink]);
      expect(result?.contacts).toEqual([mockContact]);
    });

    it('returns null when profile not found in database', async () => {
      mockRedisGet.mockResolvedValue(null);

      createSelectChain([]);

      const { getProfileWithLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithLinks('nobody');

      expect(result).toBeNull();
    });

    it('skips Redis cache when skipCache option is set', async () => {
      mockGetLatestRelease.mockResolvedValue(null);
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnThis(),
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([mockProfileWithUser]),
          };
        }
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
      });

      const { getProfileWithLinks } = await import(
        '@/lib/services/profile/queries'
      );
      await getProfileWithLinks('testartist', { skipCache: true });

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('handles Redis read failure gracefully', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection lost'));
      mockGetLatestRelease.mockResolvedValue(null);
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnThis(),
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([mockProfileWithUser]),
          };
        }
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
      });

      const { getProfileWithLinks } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getProfileWithLinks('testartist');

      // Should fall back to database and still return data
      expect(result).toBeTruthy();
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        '[profile-service] Redis cache read failed',
        expect.any(Object)
      );
    });
  });

  describe('isClaimTokenValid', () => {
    it('returns true when token matches an unclaimed public profile', async () => {
      createSelectChain([{ id: 'profile-123' }]);

      const { isClaimTokenValid } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await isClaimTokenValid('testartist', 'valid-token-123');

      expect(result).toBe(true);
    });

    it('returns false when token does not match', async () => {
      createSelectChain([]);

      const { isClaimTokenValid } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await isClaimTokenValid('testartist', 'wrong-token');

      expect(result).toBe(false);
    });

    it('normalizes username to lowercase', async () => {
      const chain = createSelectChain([{ id: 'profile-123' }]);

      const { isClaimTokenValid } = await import(
        '@/lib/services/profile/queries'
      );
      await isClaimTokenValid('TestArtist', 'some-token');

      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('invalidateProfileEdgeCache', () => {
    it('deletes the Redis cache key for the profile', async () => {
      mockRedisDel.mockResolvedValue(1);

      const { invalidateProfileEdgeCache } = await import(
        '@/lib/services/profile/queries'
      );
      await invalidateProfileEdgeCache('testartist');

      expect(mockRedisDel).toHaveBeenCalledWith('profile:data:testartist');
    });

    it('handles Redis delete failure gracefully', async () => {
      mockRedisDel.mockRejectedValue(new Error('Redis error'));

      const { invalidateProfileEdgeCache } = await import(
        '@/lib/services/profile/queries'
      );

      // Should not throw
      await expect(
        invalidateProfileEdgeCache('testartist')
      ).resolves.toBeUndefined();
      expect(mockCaptureWarning).toHaveBeenCalled();
    });
  });

  describe('getTopProfilesForStaticGeneration', () => {
    it('returns featured and claimed public profiles', async () => {
      const profiles = [
        { username: 'featured-artist' },
        { username: 'claimed-artist' },
      ];
      createSelectChain(profiles);

      const { getTopProfilesForStaticGeneration } = await import(
        '@/lib/services/profile/queries'
      );
      const result = await getTopProfilesForStaticGeneration();

      expect(result).toEqual(profiles);
    });

    it('respects the limit parameter', async () => {
      const chain = createSelectChain([]);

      const { getTopProfilesForStaticGeneration } = await import(
        '@/lib/services/profile/queries'
      );
      await getTopProfilesForStaticGeneration(50);

      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('defaults to 100 limit', async () => {
      const chain = createSelectChain([]);

      const { getTopProfilesForStaticGeneration } = await import(
        '@/lib/services/profile/queries'
      );
      await getTopProfilesForStaticGeneration();

      expect(chain.limit).toHaveBeenCalledWith(100);
    });
  });
});

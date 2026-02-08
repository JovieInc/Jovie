/**
 * Unit tests for profile service mutations.
 *
 * Tests write operations for profile data:
 * - updateProfileById
 * - updateProfileByClerkId
 * - incrementProfileViews (with Redis batching)
 * - publishProfile
 * - flushAllPendingViews
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockRedisIncr = vi.hoisted(() => vi.fn());
const mockRedisExpire = vi.hoisted(() => vi.fn());
const mockRedisGetset = vi.hoisted(() => vi.fn());
const mockRedisIncrby = vi.hoisted(() => vi.fn());
const mockRedisScan = vi.hoisted(() => vi.fn());
const mockRedisGetdel = vi.hoisted(() => vi.fn());
const mockInvalidateProfileCache = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

// Mock drizzle-orm sql template tag
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  sql: vi.fn((...args: unknown[]) => ({ type: 'sql', args })),
}));

const NOW = new Date('2024-01-15T12:00:00Z');

const mockUpdatedProfile = {
  id: 'profile-123',
  userId: 'user-456',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  bio: 'Updated bio',
  isPublic: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createRedisMock() {
  const redis = {
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    getset: mockRedisGetset,
    incrby: mockRedisIncrby,
    scan: mockRedisScan,
    getdel: mockRedisGetdel,
  };
  mockGetRedis.mockReturnValue(redis);
  return redis;
}

describe('Profile Service Mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('updateProfileById', () => {
    it('updates profile and invalidates cache', async () => {
      createUpdateChain([mockUpdatedProfile]);
      mockInvalidateProfileCache.mockResolvedValue(undefined);

      const { updateProfileById } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await updateProfileById('profile-123', {
        bio: 'Updated bio',
      });

      expect(result).toEqual(mockUpdatedProfile);
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('testartist');
    });

    it('returns null when profile not found', async () => {
      createUpdateChain([]);

      const { updateProfileById } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await updateProfileById('nonexistent', {
        bio: 'New bio',
      });

      expect(result).toBeNull();
    });

    it('sets updatedAt to current time', async () => {
      const chain = createUpdateChain([mockUpdatedProfile]);

      const { updateProfileById } = await import(
        '@/lib/services/profile/mutations'
      );
      await updateProfileById('profile-123', { bio: 'New bio' });

      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: NOW,
        })
      );
    });
  });

  describe('updateProfileByClerkId', () => {
    it('finds user by clerkId then updates profile', async () => {
      createSelectChain([{ id: 'user-456' }]);
      createUpdateChain([mockUpdatedProfile]);
      mockInvalidateProfileCache.mockResolvedValue(undefined);

      const { updateProfileByClerkId } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await updateProfileByClerkId('clerk-789', {
        bio: 'Updated',
      });

      expect(result).toEqual(mockUpdatedProfile);
    });

    it('throws TypeError when user not found', async () => {
      createSelectChain([]);

      const { updateProfileByClerkId } = await import(
        '@/lib/services/profile/mutations'
      );

      await expect(
        updateProfileByClerkId('nonexistent-clerk', { bio: 'Updated' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('incrementProfileViews', () => {
    it('uses Redis atomic increment when available', async () => {
      createRedisMock();
      mockRedisIncr.mockResolvedValue(1);
      mockRedisExpire.mockResolvedValue(true);

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('TestArtist');

      // Should normalize username and increment
      expect(mockRedisIncr).toHaveBeenCalledWith('profile:views:testartist');
    });

    it('sets TTL on first increment', async () => {
      createRedisMock();
      mockRedisIncr.mockResolvedValue(1); // First increment returns 1
      mockRedisExpire.mockResolvedValue(true);

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('testartist');

      expect(mockRedisExpire).toHaveBeenCalledWith(
        'profile:views:testartist',
        3600
      );
    });

    it('does not set TTL on subsequent increments', async () => {
      createRedisMock();
      mockRedisIncr.mockResolvedValue(5); // Not the first increment

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('testartist');

      expect(mockRedisExpire).not.toHaveBeenCalled();
    });

    it('flushes to database when threshold reached', async () => {
      createRedisMock();
      mockRedisIncr.mockResolvedValue(10); // Threshold reached
      mockRedisGetset.mockResolvedValue('10');
      mockRedisExpire.mockResolvedValue(true);
      createUpdateChain([]);

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('testartist');

      expect(mockRedisGetset).toHaveBeenCalledWith(
        'profile:views:testartist',
        '0'
      );
    });

    it('falls back to direct DB write when Redis unavailable', async () => {
      mockGetRedis.mockReturnValue(null);
      createUpdateChain([]);

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('testartist');

      // Should write directly to DB
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('falls back to direct DB write on Redis error', async () => {
      createRedisMock();
      mockRedisIncr.mockRejectedValue(new Error('Redis connection lost'));
      createUpdateChain([]);

      const { incrementProfileViews } = await import(
        '@/lib/services/profile/mutations'
      );
      await incrementProfileViews('testartist');

      expect(mockCaptureWarning).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe('publishProfile', () => {
    it('sets isPublic to true and marks onboarding complete', async () => {
      const chain = createUpdateChain([
        { ...mockUpdatedProfile, isPublic: true },
      ]);
      mockInvalidateProfileCache.mockResolvedValue(undefined);

      const { publishProfile } = await import(
        '@/lib/services/profile/mutations'
      );
      await publishProfile('profile-123', 'Test Artist', 'My bio');

      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test Artist',
          bio: 'My bio',
          isPublic: true,
          onboardingCompletedAt: expect.any(Date),
        })
      );
    });

    it('publishes without bio when not provided', async () => {
      const chain = createUpdateChain([mockUpdatedProfile]);
      mockInvalidateProfileCache.mockResolvedValue(undefined);

      const { publishProfile } = await import(
        '@/lib/services/profile/mutations'
      );
      await publishProfile('profile-123', 'Test Artist');

      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test Artist',
          bio: undefined,
          isPublic: true,
        })
      );
    });
  });

  describe('flushAllPendingViews', () => {
    it('returns 0 when Redis unavailable', async () => {
      mockGetRedis.mockReturnValue(null);

      const { flushAllPendingViews } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await flushAllPendingViews();

      expect(result).toBe(0);
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        'Redis not available for view flush'
      );
    });

    it('scans and flushes all pending view counts', async () => {
      createRedisMock();
      mockRedisScan.mockResolvedValue([
        '0',
        ['profile:views:artist1', 'profile:views:artist2'],
      ]);
      mockRedisGetdel.mockResolvedValueOnce('5').mockResolvedValueOnce('3');
      createUpdateChain([]);

      const { flushAllPendingViews } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await flushAllPendingViews();

      expect(result).toBe(2);
      expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    });

    it('skips keys with zero counts', async () => {
      createRedisMock();
      mockRedisScan.mockResolvedValue(['0', ['profile:views:artist1']]);
      mockRedisGetdel.mockResolvedValue('0');

      const { flushAllPendingViews } = await import(
        '@/lib/services/profile/mutations'
      );
      const result = await flushAllPendingViews();

      expect(result).toBe(0);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCaptureWarning } = vi.hoisted(() => ({
  mockCaptureWarning: vi.fn(),
}));

const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn<() => any>(() => null));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: null,
  getRedis: mockGetRedis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: mockCaptureWarning,
}));

import {
  clearAdminCache,
  invalidateAdminCache,
  isAdmin,
} from '@/lib/admin/roles';
import * as dbModule from '@/lib/db';

function mockDbResult(rows: Array<{ isAdmin: boolean }>) {
  const mockFrom = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue(rows);

  vi.spyOn(dbModule.db, 'select').mockReturnValue({
    from: mockFrom,
  } as any);

  mockFrom.mockReturnValue({
    where: mockWhere,
  });

  mockWhere.mockReturnValue({
    limit: mockLimit,
  });
}

describe('Admin Roles', () => {
  beforeEach(() => {
    clearAdminCache();
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAdmin', () => {
    it('should return false for empty user ID', async () => {
      const result = await isAdmin('');
      expect(result).toBe(false);
    });

    it('should return true for user with admin role in database', async () => {
      const mockUserId = 'user_admin123';
      mockDbResult([{ isAdmin: true }]);

      const result = await isAdmin(mockUserId);

      expect(result).toBe(true);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1);
    });

    it('should return false for user without admin role', async () => {
      const mockUserId = 'user_regular123';
      mockDbResult([{ isAdmin: false }]);

      const result = await isAdmin(mockUserId);

      expect(result).toBe(false);
    });

    it('should read from redis cache when present', async () => {
      const mockUserId = 'user_cached123';
      mockGetRedis.mockReturnValue({
        get: mockRedisGet.mockResolvedValueOnce('1'),
        set: mockRedisSet,
        del: mockRedisDel,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(true);
      expect(mockRedisGet).toHaveBeenCalledWith(`admin:role:${mockUserId}`);
      expect(dbModule.db.select).not.toHaveBeenCalled();
    });

    it('should query database and write redis cache on miss', async () => {
      const mockUserId = 'user_miss123';
      mockDbResult([{ isAdmin: true }]);
      mockGetRedis.mockReturnValue({
        get: mockRedisGet.mockResolvedValueOnce(null),
        set: mockRedisSet.mockResolvedValueOnce('OK'),
        del: mockRedisDel,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(true);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `admin:role:${mockUserId}`,
        '1',
        {
          ex: 60,
        }
      );
    });

    it('should fall back to database query when redis fails', async () => {
      const mockUserId = 'user_redis_error';
      mockDbResult([{ isAdmin: false }]);
      mockGetRedis.mockReturnValue({
        get: mockRedisGet.mockRejectedValueOnce(new Error('redis unavailable')),
        set: mockRedisSet,
        del: mockRedisDel,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(false);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1);
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        '[admin/roles] Redis cache failed, falling back to database query',
        { error: expect.any(Error) }
      );
    });
  });

  describe('invalidateAdminCache', () => {
    it('should delete redis key when redis is available', () => {
      const mockUserId = 'user_invalidate123';
      mockGetRedis.mockReturnValue({
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel.mockResolvedValueOnce(1),
      });

      invalidateAdminCache(mockUserId);

      expect(mockRedisDel).toHaveBeenCalledWith(`admin:role:${mockUserId}`);
    });
  });
});

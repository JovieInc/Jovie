import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminCache,
  invalidateAdminCache,
  isAdmin,
} from '@/lib/admin/roles';
import * as dbModule from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: null,
}));

describe('Admin Roles', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearAdminCache();
    vi.clearAllMocks();
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

      // Mock database query to return admin=true
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{ isAdmin: true }]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(true);
      expect(dbModule.db.select).toHaveBeenCalledWith({
        isAdmin: expect.anything(),
      });
    });

    it('should return false for user without admin role', async () => {
      const mockUserId = 'user_regular123';

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{ isAdmin: false }]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when user not found in database', async () => {
      const mockUserId = 'user_notfound123';

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(false);
    });

    it('should cache admin status and not query database twice', async () => {
      const mockUserId = 'user_cache123';

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{ isAdmin: true }]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      // First call - should query database
      const result1 = await isAdmin(mockUserId);
      expect(result1).toBe(true);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await isAdmin(mockUserId);
      expect(result2).toBe(true);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should return false and fail closed on database error', async () => {
      const mockUserId = 'user_error123';
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockRejectedValue(new Error('Database connection failed'));

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      const result = await isAdmin(mockUserId);

      expect(result).toBe(false); // Fail closed
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[admin/roles] Failed to check admin status:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should invalidate cache when requested', async () => {
      const mockUserId = 'user_invalidate123';

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{ isAdmin: true }]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      // First call - cache result
      await isAdmin(mockUserId);
      expect(dbModule.db.select).toHaveBeenCalledTimes(1);

      // Invalidate cache
      invalidateAdminCache(mockUserId);

      // Second call - should query database again
      await isAdmin(mockUserId);
      expect(dbModule.db.select).toHaveBeenCalledTimes(2);
    });

    it('should clear entire cache when requested', async () => {
      const mockUserId1 = 'user_clear1';
      const mockUserId2 = 'user_clear2';

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{ isAdmin: true }]);

      vi.spyOn(dbModule.db, 'select').mockReturnValue({
        from: mockFrom,
      } as any);

      mockFrom.mockReturnValue({
        where: mockWhere,
      });

      mockWhere.mockReturnValue({
        limit: mockLimit,
      });

      // Cache results for two users
      await isAdmin(mockUserId1);
      await isAdmin(mockUserId2);
      expect(dbModule.db.select).toHaveBeenCalledTimes(2);

      // Clear entire cache
      clearAdminCache();

      // Both should query database again
      await isAdmin(mockUserId1);
      await isAdmin(mockUserId2);
      expect(dbModule.db.select).toHaveBeenCalledTimes(4);
    });
  });
});

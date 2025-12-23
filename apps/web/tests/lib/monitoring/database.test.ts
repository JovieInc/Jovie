/**
 * Database Monitoring Tests
 * Tests for database query tracking utilities
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@/lib/analytics';
import {
  isSlowQuery,
  trackDatabaseQuery,
  trackSupabaseQuery,
} from '@/lib/monitoring/database';

describe('Database Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackDatabaseQuery', () => {
    it('should track successful query with duration', async () => {
      const queryFn = vi.fn().mockResolvedValue({ data: 'test' });

      const tracker = trackDatabaseQuery('test_operation');
      const result = await tracker(queryFn);

      expect(result).toEqual({ data: 'test' });
      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'test_operation',
          success: true,
          duration: expect.any(Number),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should track failed query with error', async () => {
      const error = new Error('Database error');
      const queryFn = vi.fn().mockRejectedValue(error);

      const tracker = trackDatabaseQuery('failing_operation');

      await expect(tracker(queryFn)).rejects.toThrow('Database error');

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'failing_operation',
          success: false,
          error: 'Database error',
          duration: expect.any(Number),
        })
      );
    });

    it('should handle non-Error objects in catch', async () => {
      const queryFn = vi.fn().mockRejectedValue('string error');

      const tracker = trackDatabaseQuery('string_error_operation');

      await expect(tracker(queryFn)).rejects.toBe('string error');

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          error: 'string error',
        })
      );
    });

    it('should measure actual query duration', async () => {
      vi.useFakeTimers();

      const queryFn = vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve('result'), 100);
          })
      );

      const tracker = trackDatabaseQuery('timed_operation');
      const resultPromise = tracker(queryFn);

      vi.advanceTimersByTime(100);
      await resultPromise;

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );

      vi.useRealTimers();
    });
  });

  describe('trackSupabaseQuery', () => {
    it('should create tracker with correct operation name for select', async () => {
      const queryFn = vi.fn().mockResolvedValue([{ id: 1 }]);

      const tracker = trackSupabaseQuery('users', 'select');
      await tracker(queryFn);

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'supabase_users_select',
        })
      );
    });

    it('should create tracker with correct operation name for insert', async () => {
      const queryFn = vi.fn().mockResolvedValue({ id: 1 });

      const tracker = trackSupabaseQuery('users', 'insert');
      await tracker(queryFn);

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'supabase_users_insert',
        })
      );
    });

    it('should create tracker with correct operation name for update', async () => {
      const queryFn = vi.fn().mockResolvedValue({ id: 1 });

      const tracker = trackSupabaseQuery('users', 'update');
      await tracker(queryFn);

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'supabase_users_update',
        })
      );
    });

    it('should create tracker with correct operation name for delete', async () => {
      const queryFn = vi.fn().mockResolvedValue(null);

      const tracker = trackSupabaseQuery('users', 'delete');
      await tracker(queryFn);

      expect(track).toHaveBeenCalledWith(
        'performance_database_query',
        expect.objectContaining({
          operation: 'supabase_users_delete',
        })
      );
    });
  });

  describe('isSlowQuery', () => {
    it('should return true for queries exceeding default threshold (500ms)', () => {
      expect(isSlowQuery(600)).toBe(true);
      expect(isSlowQuery(1000)).toBe(true);
    });

    it('should return false for queries within default threshold', () => {
      expect(isSlowQuery(400)).toBe(false);
      expect(isSlowQuery(500)).toBe(false);
    });

    it('should respect custom threshold', () => {
      expect(isSlowQuery(600, 1000)).toBe(false);
      expect(isSlowQuery(1100, 1000)).toBe(true);
    });

    it('should handle edge cases', () => {
      expect(isSlowQuery(0)).toBe(false);
      expect(isSlowQuery(500.001)).toBe(true);
    });
  });
});

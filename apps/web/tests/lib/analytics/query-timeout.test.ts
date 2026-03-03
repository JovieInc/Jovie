/**
 * Query Timeout Tests
 * Validates timeout behavior for analytics queries
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiQuery,
  dashboardQuery,
  isPostgresTimeoutError,
  isQueryTimeoutError,
  QUERY_TIMEOUTS,
  QueryTimeoutError,
  withTimeout,
} from '@/lib/db/query-timeout';

describe('Query Timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('QUERY_TIMEOUTS', () => {
    it('should have correct default timeout values', () => {
      expect(QUERY_TIMEOUTS.dashboard).toBe(20000); // 20 seconds
      expect(QUERY_TIMEOUTS.api).toBe(5000); // 5 seconds
      expect(QUERY_TIMEOUTS.default).toBe(5000); // 5 seconds
    });
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const fastPromise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 10);
      });

      const resultPromise = withTimeout(fastPromise, 1000, 'Test query');
      vi.advanceTimersByTime(10);
      const result = await resultPromise;

      expect(result).toBe('success');
    });

    it('should reject when promise exceeds timeout', async () => {
      const slowPromise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 500);
      });

      const resultPromise = withTimeout(slowPromise, 50, 'Slow query');
      vi.advanceTimersByTime(51);
      await expect(resultPromise).rejects.toThrow(QueryTimeoutError);
    });

    it('should include context in timeout error message', async () => {
      const slowPromise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 500);
      });

      const resultPromise = withTimeout(slowPromise, 50, 'My analytics query');
      vi.advanceTimersByTime(51);

      try {
        await resultPromise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueryTimeoutError);
        expect((error as Error).message).toContain('My analytics query');
        expect((error as Error).message).toContain('50ms');
      }
    });

    it('should propagate original errors', async () => {
      const errorPromise = Promise.reject(new Error('Original error'));

      await expect(withTimeout(errorPromise, 1000, 'Test')).rejects.toThrow(
        'Original error'
      );
    });
  });

  describe('dashboardQuery', () => {
    it('should use dashboard timeout (20s)', async () => {
      const fastQuery = async () => 'result';

      const result = await dashboardQuery(fastQuery, 'Test dashboard query');

      expect(result).toBe('result');
    });

    it('should timeout slow dashboard queries', async () => {
      const slowQuery = async () => {
        await new Promise(resolve => setTimeout(resolve, 15000));
        return 'result';
      };

      const resultPromise = withTimeout(slowQuery(), 50, 'Dashboard query');
      vi.advanceTimersByTime(51);
      await expect(resultPromise).rejects.toThrow(QueryTimeoutError);
    });
  });

  describe('apiQuery', () => {
    it('should use API timeout (5s)', async () => {
      const fastQuery = async () => ({ data: 'result' });

      const result = await apiQuery(fastQuery, 'Test API query');

      expect(result).toEqual({ data: 'result' });
    });
  });

  describe('QueryTimeoutError', () => {
    it('should be an instance of Error', () => {
      const error = new QueryTimeoutError('Test timeout');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('QueryTimeoutError');
      expect(error.message).toBe('Test timeout');
    });
  });

  describe('isQueryTimeoutError', () => {
    it('should return true for QueryTimeoutError', () => {
      const error = new QueryTimeoutError('Test');

      expect(isQueryTimeoutError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isQueryTimeoutError(new Error('Regular error'))).toBe(false);
      expect(isQueryTimeoutError('string error')).toBe(false);
      expect(isQueryTimeoutError(null)).toBe(false);
      expect(isQueryTimeoutError(undefined)).toBe(false);
    });
  });

  describe('isPostgresTimeoutError', () => {
    it('should detect PostgreSQL timeout errors', () => {
      const pgTimeoutError = new Error(
        'canceling statement due to statement timeout'
      );

      expect(isPostgresTimeoutError(pgTimeoutError)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isPostgresTimeoutError(new Error('Connection failed'))).toBe(
        false
      );
      expect(isPostgresTimeoutError('string error')).toBe(false);
      expect(isPostgresTimeoutError(null)).toBe(false);
    });
  });
});

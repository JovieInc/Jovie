/**
 * Tests for the request deduplication utility
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCache,
  dedupedFetch,
  dedupedFetchWithMeta,
  FetchError,
  getCacheStats,
  invalidateCache,
  invalidateCacheMatching,
  prefetch,
} from '@/lib/fetch/deduped-fetch';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('dedupedFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCacheIsolationForTests();
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  describe('basic functionality', () => {
    it('should fetch data and return parsed JSON', async () => {
      const mockData = { status: 'ok', value: 42 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await dedupedFetch('/api/test');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
    });

    it('should throw FetchError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found',
      });

      await expect(dedupedFetch('/api/missing')).rejects.toThrow(FetchError);

      // Clear cache before second test to avoid using cached error
      clearCache();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found',
      });

      try {
        await dedupedFetch('/api/missing');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBe(404);
      }
    });

    it('should pass through fetch options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await dedupedFetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });
    });
  });

  describe('request deduplication', () => {
    it('should deduplicate concurrent requests to the same URL', async () => {
      const mockData = { id: 1, name: 'Test' };
      let resolvePromise: () => void;
      const fetchPromise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(async () => {
        await fetchPromise;
        return {
          ok: true,
          json: async () => mockData,
        };
      });

      // Start two concurrent requests
      const promise1 = dedupedFetch('/api/user/1');
      const promise2 = dedupedFetch('/api/user/1');

      // Resolve the fetch
      resolvePromise!();

      // Both should return the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not deduplicate requests to different URLs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 2 }),
        });

      const [result1, result2] = await Promise.all([
        dedupedFetch('/api/user/1'),
        dedupedFetch('/api/user/2'),
      ]);

      expect(result1).toEqual({ id: 1 });
      expect(result2).toEqual({ id: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('response caching', () => {
    it('should return cached response within TTL', async () => {
      const mockData = { cached: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      // First fetch
      const result1 = await dedupedFetch('/api/cached', { ttlMs: 10000 });

      // Second fetch (should use cache)
      const result2 = await dedupedFetch('/api/cached', { ttlMs: 10000 });

      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should refetch after TTL expires', async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: 2 }),
        });

      // First fetch
      const result1 = await dedupedFetch('/api/data', { ttlMs: 1000 });
      expect(result1).toEqual({ version: 1 });

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Second fetch (cache expired)
      const result2 = await dedupedFetch('/api/data', { ttlMs: 1000 });
      expect(result2).toEqual({ version: 2 });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should bypass cache with forceRefresh', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ first: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ second: true }),
        });

      const result1 = await dedupedFetch('/api/data');
      const result2 = await dedupedFetch('/api/data', { forceRefresh: true });

      expect(result1).toEqual({ first: true });
      expect(result2).toEqual({ second: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('dedupedFetchWithMeta', () => {
    it('should return metadata about cache status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      // First fetch
      const result1 = await dedupedFetchWithMeta('/api/meta');
      expect(result1.fromCache).toBe(false);
      expect(result1.data).toEqual({ data: 'test' });
      expect(result1.fetchedAt).toBeGreaterThan(0);

      // Second fetch (from cache)
      const result2 = await dedupedFetchWithMeta('/api/meta');
      expect(result2.fromCache).toBe(true);
      expect(result2.data).toEqual({ data: 'test' });
    });
  });

  describe('cache management', () => {
    it('should invalidate specific cache entry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ v: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ v: 2 }),
        });

      await dedupedFetch('/api/entry');
      invalidateCache('/api/entry');
      await dedupedFetch('/api/entry');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache entries matching pattern', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ a: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ b: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ a: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ b: 4 }),
        });

      await dedupedFetch('/api/users/1');
      await dedupedFetch('/api/posts/1');

      // Invalidate all user-related cache entries
      invalidateCacheMatching(key => key.includes('/users/'));

      await dedupedFetch('/api/users/1');
      await dedupedFetch('/api/posts/1'); // Should use cache

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should clear all cache entries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await dedupedFetch('/api/a');
      await dedupedFetch('/api/b');

      const stats1 = getCacheStats();
      expect(stats1.cacheSize).toBe(2);

      clearCache();

      const stats2 = getCacheStats();
      expect(stats2.cacheSize).toBe(0);
    });

    it('should return cache statistics', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await dedupedFetch('/api/stats/1');
      await dedupedFetch('/api/stats/2');

      const stats = getCacheStats();

      expect(stats.cacheSize).toBe(2);
      expect(stats.keys.some(key => key.endsWith('/api/stats/1'))).toBe(true);
      expect(stats.keys.some(key => key.endsWith('/api/stats/2'))).toBe(true);
    });
  });

  describe('prefetch', () => {
    it('should prefetch and cache data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prefetched: true }),
      });

      await prefetch('/api/prefetch');

      // Subsequent fetch should use cache
      const result = await dedupedFetch('/api/prefetch');

      expect(result).toEqual({ prefetched: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should silently ignore prefetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(prefetch('/api/failing')).resolves.toBeUndefined();
    });
  });

  describe('custom cache keys', () => {
    it('should use custom key when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ custom: true }),
      });

      await dedupedFetch('/api/data?param=1', { key: 'custom-key' });

      // Same custom key should use cache
      const result = await dedupedFetch('/api/data?param=2', {
        key: 'custom-key',
      });

      expect(result).toEqual({ custom: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('different HTTP methods', () => {
    it('should create different cache keys for different methods', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ method: 'GET' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ method: 'POST' }),
        });

      const getResult = await dedupedFetch('/api/resource');
      const postResult = await dedupedFetch('/api/resource', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(getResult).toEqual({ method: 'GET' });
      expect(postResult).toEqual({ method: 'POST' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('JOV-6186 cache isolation', () => {
    it('does not cache or dedupe side-effecting requests', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 2 }),
        });

      const first = await dedupedFetch('/api/resource', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });
      const second = await dedupedFetch('/api/resource', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(first).toEqual({ id: 1 });
      expect(second).toEqual({ id: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(getCacheStats().cacheSize).toBe(0);
    });

    it('does not rehydrate the cache from a late in-flight response after clear', async () => {
      let resolveJson: ((value: unknown) => void) | undefined;
      mockFetch
        .mockImplementationOnce(
          () =>
            Promise.resolve({
              ok: true,
              json: () =>
                new Promise(resolve => {
                  resolveJson = resolve;
                }),
            }) as Promise<Response>
        )
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ secret: 'B' }),
        });

      const pendingA = dedupedFetch('/api/private');
      await vi.waitFor(() => {
        expect(typeof resolveJson).toBe('function');
      });
      clearCache();
      resolveJson?.({ secret: 'A' });
      await expect(pendingA).resolves.toEqual({ secret: 'A' });

      const after = await dedupedFetchWithMeta('/api/private');
      expect(after.fromCache).toBe(false);
      expect(after.data).toEqual({ secret: 'B' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not let one subscriber abort a still-needed shared GET', async () => {
      const firstController = new AbortController();
      const secondController = new AbortController();
      let resolveJson: ((value: unknown) => void) | undefined;
      mockFetch.mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          Promise.resolve({
            ok: true,
            json: () =>
              new Promise(resolve => {
                resolveJson = resolve;
              }),
            signal: init?.signal,
          }) as Promise<Response>
      );

      const first = dedupedFetch('/api/shared', {
        signal: firstController.signal,
      });
      const second = dedupedFetch('/api/shared', {
        signal: secondController.signal,
      });

      await vi.waitFor(() => {
        expect(typeof resolveJson).toBe('function');
      });

      firstController.abort();
      const sharedInit = mockFetch.mock.calls[0]?.[1] as
        | RequestInit
        | undefined;
      expect(sharedInit?.signal?.aborted).not.toBe(true);
      resolveJson?.({ ok: true });
      await expect(second).resolves.toEqual({ ok: true });
      await expect(first).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not collide the same URL across profile scopes and still dedupes one scope', async () => {
      applyCacheScope({
        userId: 'user-a',
        sessionId: 'sess-a',
        profileId: 'profile-a',
        ready: true,
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ owner: 'A' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ owner: 'B' }),
        });

      const firstA = dedupedFetch('/api/private');
      const secondA = dedupedFetch('/api/private');
      await expect(Promise.all([firstA, secondA])).resolves.toEqual([
        { owner: 'A' },
        { owner: 'A' },
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      applyCacheScope({ profileId: 'profile-b' });
      const fromB = await dedupedFetch('/api/private');
      expect(fromB).toEqual({ owner: 'B' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

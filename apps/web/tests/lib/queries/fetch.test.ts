import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMutationFn,
  createQueryFn,
  FetchError,
  fetchWithTimeout,
} from '@/lib/queries/fetch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetch utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FetchError', () => {
    it('correctly identifies client errors (4xx)', () => {
      const error400 = new FetchError('Bad Request', 400);
      const error404 = new FetchError('Not Found', 404);
      const error499 = new FetchError('Client Error', 499);

      expect(error400.isClientError()).toBe(true);
      expect(error404.isClientError()).toBe(true);
      expect(error499.isClientError()).toBe(true);
      expect(error400.isServerError()).toBe(false);
    });

    it('correctly identifies server errors (5xx)', () => {
      const error500 = new FetchError('Internal Server Error', 500);
      const error503 = new FetchError('Service Unavailable', 503);

      expect(error500.isServerError()).toBe(true);
      expect(error503.isServerError()).toBe(true);
      expect(error500.isClientError()).toBe(false);
    });

    it('correctly identifies retryable errors', () => {
      // Retryable: 408 (timeout), 429 (rate limit), 5xx
      expect(new FetchError('Timeout', 408).isRetryable()).toBe(true);
      expect(new FetchError('Rate Limited', 429).isRetryable()).toBe(true);
      expect(new FetchError('Server Error', 500).isRetryable()).toBe(true);
      expect(new FetchError('Bad Gateway', 502).isRetryable()).toBe(true);

      // Not retryable: other 4xx errors
      expect(new FetchError('Bad Request', 400).isRetryable()).toBe(false);
      expect(new FetchError('Unauthorized', 401).isRetryable()).toBe(false);
      expect(new FetchError('Not Found', 404).isRetryable()).toBe(false);
    });

    it('preserves response object when provided', () => {
      const mockResponse = new Response('{}', { status: 404 });
      const error = new FetchError('Not Found', 404, mockResponse);

      expect(error.response).toBe(mockResponse);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.name).toBe('FetchError');
    });
  });

  describe('fetchWithTimeout', () => {
    it('returns parsed JSON on successful response', async () => {
      const mockData = { id: '123', name: 'Test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchWithTimeout<typeof mockData>('/api/test');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
    });

    it('throws FetchError on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchWithTimeout('/api/test')).rejects.toThrow(FetchError);
    });

    it('throws FetchError with correct status on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      try {
        await fetchWithTimeout('/api/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBe(404);
      }
    });

    it('throws FetchError with status 502 on invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      try {
        await fetchWithTimeout('/api/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBe(502);
        expect((error as FetchError).message).toBe('Invalid JSON response');
      }
    });

    it('uses default 10s timeout when not specified', async () => {
      const mockData = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await fetchWithTimeout('/api/test');

      // Verify the signal was created (we can't directly inspect timeout value)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('passes through custom fetch options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await fetchWithTimeout('/api/test', {
        method: 'POST',
        headers: { 'X-Custom': 'value' },
        body: JSON.stringify({ data: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-Custom': 'value' },
          body: JSON.stringify({ data: 'test' }),
        })
      );
    });
  });

  describe('createQueryFn', () => {
    it('creates a function that fetches from the specified URL', async () => {
      const mockData = { profile: 'data' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const queryFn = createQueryFn<typeof mockData>('/api/dashboard/profile');
      const result = await queryFn({});

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/profile',
        expect.any(Object)
      );
    });

    it('passes signal to fetchWithTimeout for query cancellation', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const controller = new AbortController();
      const queryFn = createQueryFn<typeof mockData>('/api/test');
      await queryFn({ signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('merges custom options with signal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const queryFn = createQueryFn('/api/test', {
        headers: { Authorization: 'Bearer token' },
      });
      await queryFn({});

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        })
      );
    });
  });

  describe('createMutationFn', () => {
    it('creates a function that POSTs by default', async () => {
      const mockResponse = { id: 'new-123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const mutationFn = createMutationFn<
        { name: string },
        typeof mockResponse
      >('/api/create');
      const result = await mutationFn({ name: 'Test' });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/create',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });

    it('supports PATCH method for updates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ updated: true }),
      });

      const mutationFn = createMutationFn<
        { bio: string },
        { updated: boolean }
      >('/api/profile', 'PATCH');
      await mutationFn({ bio: 'New bio' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ bio: 'New bio' }),
        })
      );
    });

    it('supports PUT method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const mutationFn = createMutationFn('/api/replace', 'PUT');
      await mutationFn({ complete: 'data' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/replace',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('supports DELETE method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      const mutationFn = createMutationFn('/api/item/123', 'DELETE');
      await mutationFn({});

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/item/123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('merges custom headers with Content-Type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const mutationFn = createMutationFn('/api/test', 'POST', {
        headers: { Authorization: 'Bearer token' },
      });
      await mutationFn({ data: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
        })
      );
    });

    it('propagates FetchError on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const mutationFn = createMutationFn('/api/create', 'POST');

      try {
        await mutationFn({ invalid: 'data' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBe(400);
      }
    });
  });
});

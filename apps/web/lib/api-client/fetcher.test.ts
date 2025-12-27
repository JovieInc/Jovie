/**
 * Tests for the API Client Fetcher
 *
 * Covers: success cases, error handling, timeout behavior, response parsing,
 * and the result pattern API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureGlobalFetcher,
  createFetcher,
  del,
  fetcher,
  get,
  patch,
  post,
  put,
  request,
  resetGlobalFetcher,
} from './fetcher';
import { ApiError, ApiErrorCode } from './types';

// =============================================================================
// Mock Setup
// =============================================================================

// Store original fetch
const originalFetch = globalThis.fetch;

// Mock fetch implementation helper
function mockFetch(
  response: Partial<Response> & { json?: () => Promise<unknown> }
): void {
  const defaultHeaders = new Headers({ 'content-type': 'application/json' });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    headers: response.headers ?? defaultHeaders,
    json: response.json ?? (() => Promise.resolve({})),
    text: () => Promise.resolve(''),
  });
}

// Mock fetch to reject with error
function mockFetchError(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error);
}

// Mock fetch that never resolves (for timeout testing)
function mockFetchHang(): void {
  globalThis.fetch = vi.fn().mockImplementation(
    () => new Promise(() => {}) // Never resolves
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetGlobalFetcher();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // ===========================================================================
  // Success Cases
  // ===========================================================================

  describe('success cases', () => {
    it('GET: returns parsed JSON data', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1, name: 'Test' }),
      });

      const result = await get<{ id: number; name: string }>('/api/test');

      expect(result).toEqual({ id: 1, name: 'Test' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('POST: sends body and returns response', async () => {
      mockFetch({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 2, created: true }),
      });

      const result = await post<{ id: number; created: boolean }>(
        '/api/items',
        {
          body: { name: 'New Item' },
        }
      );

      expect(result).toEqual({ id: 2, created: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Item' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('PUT: sends body and returns response', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1, updated: true }),
      });

      const result = await put<{ id: number; updated: boolean }>(
        '/api/items/1',
        {
          body: { name: 'Updated Item' },
        }
      );

      expect(result).toEqual({ id: 1, updated: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Item' }),
        })
      );
    });

    it('PATCH: sends partial body and returns response', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1, patched: true }),
      });

      const result = await patch<{ id: number; patched: boolean }>(
        '/api/items/1',
        {
          body: { status: 'active' },
        }
      );

      expect(result).toEqual({ id: 1, patched: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        })
      );
    });

    it('DELETE: sends request and returns response', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ deleted: true }),
      });

      const result = await del<{ deleted: boolean }>('/api/items/1');

      expect(result).toEqual({ deleted: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('handles 204 No Content responses', async () => {
      mockFetch({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-length': '0' }),
        json: () => Promise.reject(new Error('No JSON')),
      });

      const result = await del<null>('/api/items/1');

      expect(result).toBeNull();
    });

    it('handles empty response bodies', async () => {
      mockFetch({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '0' }),
        json: () => Promise.reject(new Error('No JSON')),
      });

      const result = await get<null>('/api/ping');

      expect(result).toBeNull();
    });

    it('includes custom headers in request', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/api/test', {
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Response with Full Details
  // ===========================================================================

  describe('WithResponse variants', () => {
    it('getWithResponse: returns full response object', async () => {
      const responseHeaders = new Headers({
        'content-type': 'application/json',
        'x-request-id': '123',
      });
      mockFetch({
        ok: true,
        status: 200,
        headers: responseHeaders,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const response = await fetcher.getWithResponse<{ data: string }>(
        '/api/test'
      );

      expect(response.data).toEqual({ data: 'test' });
      expect(response.status).toBe(200);
      expect(response.headers.get('x-request-id')).toBe('123');
    });

    it('postWithResponse: returns full response object', async () => {
      mockFetch({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1 }),
      });

      const response = await fetcher.postWithResponse<{ id: number }>(
        '/api/items',
        {
          body: { name: 'Test' },
        }
      );

      expect(response.data).toEqual({ id: 1 });
      expect(response.status).toBe(201);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('throws ApiError for 400 Bad Request', async () => {
      mockFetch({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid input' }),
      });

      await expect(get('/api/test')).rejects.toThrow(ApiError);

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.BAD_REQUEST);
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe('Invalid input');
      }
    });

    it('throws ApiError for 401 Unauthorized', async () => {
      mockFetch({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Not authenticated' }),
      });

      try {
        await get('/api/protected');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.UNAUTHORIZED);
        expect(apiError.isUnauthorized()).toBe(true);
      }
    });

    it('throws ApiError for 403 Forbidden', async () => {
      mockFetch({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Access denied' }),
      });

      try {
        await get('/api/admin');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.FORBIDDEN);
        expect(apiError.isForbidden()).toBe(true);
      }
    });

    it('throws ApiError for 404 Not Found', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Resource not found' }),
      });

      try {
        await get('/api/items/999');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.NOT_FOUND);
        expect(apiError.isNotFound()).toBe(true);
      }
    });

    it('throws ApiError for 409 Conflict', async () => {
      mockFetch({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Version conflict' }),
      });

      try {
        await put('/api/items/1', { body: {} });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.CONFLICT);
      }
    });

    it('throws ApiError for 422 Unprocessable Entity', async () => {
      mockFetch({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: 'Validation failed' }),
      });

      try {
        await post('/api/items', { body: {} });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.UNPROCESSABLE_ENTITY);
      }
    });

    it('throws ApiError for 429 Rate Limited', async () => {
      mockFetch({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many requests' }),
      });

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.RATE_LIMITED);
        expect(apiError.isRateLimited()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('throws ApiError for 500 Server Error', async () => {
      mockFetch({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.SERVER_ERROR);
        expect(apiError.isServerError()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('provides default error message when response has no error field', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toBe('Resource not found');
      }
    });

    it('includes response body in ApiError', async () => {
      mockFetch({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'Bad request',
            details: 'Field X is required',
          }),
      });

      try {
        await post('/api/items', { body: {} });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.response?.details).toBe('Field X is required');
      }
    });
  });

  // ===========================================================================
  // Network Errors
  // ===========================================================================

  describe('network errors', () => {
    it('throws ApiError for network failures', async () => {
      mockFetchError(new Error('Failed to fetch'));

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.NETWORK_ERROR);
        expect(apiError.isNetworkError()).toBe(true);
        expect(apiError.retryable).toBe(true);
      }
    });

    it('throws ApiError with ABORTED code for AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetchError(abortError);

      try {
        await get('/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.ABORTED);
        expect(apiError.isNetworkError()).toBe(true);
        expect(apiError.retryable).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Timeout Behavior
  // ===========================================================================

  describe('timeout behavior', () => {
    it('aborts request after timeout', async () => {
      mockFetchHang();

      const timeoutPromise = get('/api/slow', { timeout: 1000 });

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(1001);

      await expect(timeoutPromise).rejects.toThrow(ApiError);

      try {
        mockFetchHang();
        const promise = get('/api/slow', { timeout: 500 });
        await vi.advanceTimersByTimeAsync(501);
        await promise;
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.TIMEOUT);
        expect(apiError.message).toBe('Request timed out');
      }
    });

    it('uses config timeout when option not specified', async () => {
      configureGlobalFetcher({ timeout: 2000 });
      mockFetchHang();

      const timeoutPromise = get('/api/slow');

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(2001);

      await expect(timeoutPromise).rejects.toThrow(ApiError);
    });

    it('clears timeout on successful response', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      // This should complete before timeout
      const result = await get<{ success: boolean }>('/api/fast', {
        timeout: 5000,
      });

      expect(result).toEqual({ success: true });
    });
  });

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  describe('response parsing', () => {
    it('handles non-JSON content-type gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('Plain text response'),
      });

      const result = await get<null>('/api/text');

      // Should return null for non-JSON responses
      expect(result).toBeNull();
    });

    it('tries to parse JSON even with wrong content-type', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('{"actually": "json"}'),
      });

      const result = await get<{ actually: string }>('/api/mixed');

      expect(result).toEqual({ actually: 'json' });
    });

    it('throws ApiError for JSON parse failures on success responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        text: () => Promise.resolve('not json'),
      });

      await expect(get('/api/bad-json')).rejects.toThrow(ApiError);

      try {
        await get('/api/bad-json');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.JSON_PARSE_ERROR);
        expect(apiError.message).toBe('Failed to parse response');
      }
    });
  });

  // ===========================================================================
  // Result Pattern (request method)
  // ===========================================================================

  describe('request method (result pattern)', () => {
    it('returns ok: true with data on success', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1, name: 'Test' }),
      });

      const result = await request<{ id: number; name: string }>(
        'GET',
        '/api/items/1'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ id: 1, name: 'Test' });
        expect(result.status).toBe(200);
      }
    });

    it('returns ok: false with error on failure', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const result = await request<{ id: number }>('GET', '/api/items/999');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ApiError);
        expect(result.error.code).toBe(ApiErrorCode.NOT_FOUND);
      }
    });

    it('returns ok: false with error on network failure', async () => {
      mockFetchError(new Error('Network error'));

      const result = await request('GET', '/api/test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ApiError);
        expect(result.error.code).toBe(ApiErrorCode.NETWORK_ERROR);
      }
    });

    it('supports POST with body', async () => {
      mockFetch({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 2 }),
      });

      const result = await request<{ id: number }>('POST', '/api/items', {
        body: { name: 'New Item' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ id: 2 });
      }
    });
  });

  // ===========================================================================
  // Configuration
  // ===========================================================================

  describe('configuration', () => {
    it('uses baseUrl from configuration', async () => {
      configureGlobalFetcher({ baseUrl: 'https://api.example.com' });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/items');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.anything()
      );
    });

    it('uses default headers from configuration', async () => {
      configureGlobalFetcher({
        defaultHeaders: {
          Authorization: 'Bearer token123',
          'X-API-Key': 'key123',
        },
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/items');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/items',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
            'X-API-Key': 'key123',
          }),
        })
      );
    });

    it('allows request headers to override default headers', async () => {
      configureGlobalFetcher({
        defaultHeaders: { Authorization: 'Bearer default' },
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/items', {
        headers: { Authorization: 'Bearer override' },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/items',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer override',
          }),
        })
      );
    });

    it('calls onError callback when error occurs', async () => {
      const onError = vi.fn();
      configureGlobalFetcher({ onError });
      mockFetch({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(get('/items')).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('calls onResponse callback for successful responses', async () => {
      const onResponse = vi.fn(response => response);
      configureGlobalFetcher({ onResponse });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await get('/items');

      expect(onResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { data: 'test' },
          status: 200,
        })
      );
    });

    it('allows onResponse to transform the response', async () => {
      configureGlobalFetcher({
        onResponse: response => ({
          ...response,
          data: { ...response.data, transformed: true },
        }),
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ original: true }),
      });

      const result = await get<{ original: boolean; transformed: boolean }>(
        '/items'
      );

      expect(result).toEqual({ original: true, transformed: true });
    });

    it('respects throwOnError: false configuration', async () => {
      configureGlobalFetcher({ throwOnError: false });
      mockFetch({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      // Should not throw, but return the data (which might be the error response)
      const result = await fetcher.getWithResponse('/items/999');

      expect(result.status).toBe(404);
    });
  });

  // ===========================================================================
  // createFetcher Factory
  // ===========================================================================

  describe('createFetcher', () => {
    it('creates independent fetcher with custom config', async () => {
      const customFetcher = createFetcher({
        baseUrl: 'https://custom.api.com',
        timeout: 5000,
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ custom: true }),
      });

      await customFetcher.get('/endpoint');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/endpoint',
        expect.anything()
      );
    });

    it('custom fetcher does not affect global fetcher', async () => {
      const customFetcher = createFetcher({
        baseUrl: 'https://custom.api.com',
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      // Custom fetcher uses its baseUrl
      await customFetcher.get('/custom');
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'https://custom.api.com/custom',
        expect.anything()
      );

      // Global fetcher uses global config (no baseUrl)
      await get('/global');
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        '/global',
        expect.anything()
      );
    });

    it('custom fetcher inherits global config', async () => {
      configureGlobalFetcher({
        defaultHeaders: { 'X-Global': 'header' },
      });
      const customFetcher = createFetcher({
        baseUrl: 'https://custom.api.com',
      });
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await customFetcher.get('/endpoint');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Global': 'header',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // AbortSignal Support
  // ===========================================================================

  describe('AbortSignal support', () => {
    it('respects provided AbortSignal', async () => {
      const controller = new AbortController();
      mockFetchHang();

      const promise = get('/api/test', { signal: controller.signal });

      // Abort the request
      controller.abort();

      await expect(promise).rejects.toThrow(ApiError);

      try {
        const controller2 = new AbortController();
        mockFetchHang();
        const promise2 = get('/api/test', { signal: controller2.signal });
        controller2.abort();
        await promise2;
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe(ApiErrorCode.ABORTED);
      }
    });

    it('respects already-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await expect(
        get('/api/test', { signal: controller.signal })
      ).rejects.toThrow(ApiError);
    });
  });

  // ===========================================================================
  // Credentials
  // ===========================================================================

  describe('credentials', () => {
    it('uses same-origin credentials by default', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/api/test');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          credentials: 'same-origin',
        })
      );
    });

    it('allows overriding credentials per request', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/api/test', { credentials: 'include' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });
  });

  // ===========================================================================
  // Cache Control
  // ===========================================================================

  describe('cache control', () => {
    it('passes cache option to fetch', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/api/test', { cache: 'no-store' });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          cache: 'no-store',
        })
      );
    });

    it('passes Next.js specific options', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await get('/api/test', {
        next: { revalidate: 60, tags: ['items'] },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          next: { revalidate: 60, tags: ['items'] },
        })
      );
    });
  });
});

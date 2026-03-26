import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isRetryableTransportError,
  ServerFetchTimeoutError,
  serverFetch,
} from '@/lib/http/server-fetch';

describe('serverFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws ServerFetchTimeoutError when the request exceeds timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      })
    );

    await expect(
      serverFetch('https://example.com/timeout', {
        timeoutMs: 10,
        context: 'Timeout test',
      })
    ).rejects.toEqual(expect.any(ServerFetchTimeoutError));
  });

  it('passes timeoutMs to the timeout error for callers to report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      })
    );

    await expect(
      serverFetch('https://example.com/timeout', {
        timeoutMs: 25,
        context: 'Timeout metadata test',
      })
    ).rejects.toMatchObject({
      timeoutMs: 25,
      context: 'Timeout metadata test',
    });
  });

  it('retries retryable HTTP responses and returns the eventual success response', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 503,
        body: {
          cancel,
        },
      } as Response)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const response = await serverFetch('https://example.com/retry', {
      context: 'Retryable status test',
      retry: {
        maxRetries: 1,
        baseDelayMs: 0,
      },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('retries network failures and succeeds on a later attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const response = await serverFetch('https://example.com/network', {
      context: 'Network retry test',
      retry: {
        maxRetries: 1,
        baseDelayMs: 0,
      },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable client errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));

    vi.stubGlobal('fetch', fetchMock);

    const response = await serverFetch('https://example.com/auth', {
      context: 'Client error test',
      retry: {
        maxRetries: 2,
        baseDelayMs: 0,
      },
    });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the final retryable response after exhausting retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('still failing', { status: 503 }));

    vi.stubGlobal('fetch', fetchMock);

    const response = await serverFetch('https://example.com/unavailable', {
      context: 'Retry exhaustion test',
      retry: {
        maxRetries: 2,
        baseDelayMs: 0,
      },
    });

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('identifies timeout and network failures as transport-retryable', () => {
    expect(
      isRetryableTransportError(
        new ServerFetchTimeoutError('timed out', 1000, 'Timeout test')
      )
    ).toBe(true);
    expect(isRetryableTransportError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableTransportError(new Error('HTTP 503'))).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BoundedFetchTimeoutError,
  boundedFetch,
  isRetryableTransportError,
} from '@/lib/http/bounded-fetch';

describe('boundedFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws BoundedFetchTimeoutError when the request exceeds timeoutMs', async () => {
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
      boundedFetch('https://example.com/timeout', {
        timeoutMs: 10,
        context: 'Timeout test',
      })
    ).rejects.toEqual(expect.any(BoundedFetchTimeoutError));
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

    const response = await boundedFetch('https://example.com/retry', {
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

  it('identifies timeout and network failures as transport-retryable', () => {
    expect(
      isRetryableTransportError(
        new BoundedFetchTimeoutError('timed out', 1000, 'Timeout test')
      )
    ).toBe(true);
    expect(isRetryableTransportError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableTransportError(new Error('HTTP 503'))).toBe(false);
  });
});

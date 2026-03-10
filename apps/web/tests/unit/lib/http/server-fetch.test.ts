import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';

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
      serverFetch('https://example.com/timeout', { timeoutMs: 10 })
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
      serverFetch('https://example.com/timeout', { timeoutMs: 25 })
    ).rejects.toMatchObject({ timeoutMs: 25 });
  });
});

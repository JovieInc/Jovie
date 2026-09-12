import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createQueryFn,
  FetchCanceledError,
  FetchDeadlineError,
  FetchDecodeError,
  FetchError,
  FetchNetworkError,
  FetchPayloadLimitError,
  fetchWithTimeout,
  fetchWithTimeoutResponse,
} from '@/lib/queries/fetch';

const mockFetch = vi.fn();

function stalledBodyResponse(prefix = ''): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (prefix) {
          controller.enqueue(new TextEncoder().encode(prefix));
        }
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('fetch contract (JOV-6184)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fails closed with a deadline when headers arrive then the body stalls', async () => {
    mockFetch.mockResolvedValueOnce(stalledBodyResponse());

    const startedAt = Date.now();
    let caught: unknown;
    try {
      await fetchWithTimeout('/api/test', { timeout: 40 });
      expect.fail('stalled body should not succeed');
    } catch (error) {
      caught = error;
    }

    expect(Date.now() - startedAt).toBeLessThan(400);
    expect(caught).toBeInstanceOf(FetchDeadlineError);
    expect(caught).toBeInstanceOf(FetchError);
    expect((caught as FetchError).kind).toBe('deadline');
    expect((caught as FetchError).status).toBe(408);
    expect((caught as FetchError).isRetryable()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the JSON deadline active while a partial body is still arriving', async () => {
    mockFetch.mockResolvedValueOnce(stalledBodyResponse('{"id":'));

    await expect(
      fetchWithTimeout('/api/test', { timeout: 40 })
    ).rejects.toEqual(expect.any(FetchDeadlineError));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retains caller cancellation identity before the request starts', async () => {
    const controller = new AbortController();
    controller.abort('leave-now');

    let caught: unknown;
    try {
      await fetchWithTimeout('/api/test', { signal: controller.signal });
      expect.fail('already-aborted input should not start');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FetchCanceledError);
    expect((caught as FetchError).kind).toBe('canceled');
    expect((caught as FetchError).status).not.toBe(408);
    expect((caught as FetchError).isRetryable()).toBe(false);
    expect((caught as FetchError).cause).toBe('leave-now');
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it('retains caller cancellation during body read and does not mark it retryable', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              );
            },
            { once: true }
          );
        })
    );

    const pending = fetchWithTimeout('/api/test', {
      signal: controller.signal,
      timeout: 10_000,
    });
    controller.abort('retry-owner-canceled');

    const caught = await pending.then(
      () => {
        throw new Error('canceled fetch resolved');
      },
      error => error
    );

    expect(caught).toBeInstanceOf(FetchCanceledError);
    expect((caught as FetchError).kind).toBe('canceled');
    expect((caught as FetchError).isRetryable()).toBe(false);
    expect((caught as FetchError).status).not.toBe(408);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not treat abort-while-waiting as a retryable timeout', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              );
            },
            { once: true }
          );
        })
    );

    const pending = fetchWithTimeout('/api/test', {
      signal: controller.signal,
      timeout: 5_000,
    });
    queueMicrotask(() => controller.abort());

    const caught = await pending.catch(error => error);
    expect(caught).toBeInstanceOf(FetchCanceledError);
    expect((caught as FetchError).isRetryable()).toBe(false);
    expect(caught instanceof FetchDeadlineError).toBe(false);
  });

  it('rejects valid JSON with the wrong shape when a schema is provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 12 }));

    await expect(
      fetchWithTimeout('/api/test', {
        schema: z.object({ id: z.string() }),
      })
    ).rejects.toEqual(expect.any(FetchDecodeError));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache an invalid domain payload as a Query success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 12 }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryKey = ['jov-6184', 'validated-shape'];

    await expect(
      queryClient.fetchQuery({
        queryKey,
        queryFn: createQueryFn('/api/profile', {
          schema: z.object({ id: z.string() }),
        }),
      })
    ).rejects.toEqual(expect.any(FetchDecodeError));

    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    expect(queryClient.getQueryState(queryKey)?.status).toBe('error');
    expect(queryClient.getQueryState(queryKey)?.data).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON as a decode failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(fetchWithTimeout('/api/test')).rejects.toMatchObject({
      kind: 'decode',
      status: 502,
      message: 'Invalid JSON response',
    });
  });

  it('rejects an oversized JSON response using the approved 1MB budget', async () => {
    const oversized = `{"pad":"${'x'.repeat(1024 * 1024)}"}`;
    mockFetch.mockResolvedValueOnce(
      new Response(oversized, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(oversized.length),
        },
      })
    );

    await expect(fetchWithTimeout('/api/test')).rejects.toEqual(
      expect.any(FetchPayloadLimitError)
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204 no-content instead of decoding a body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(fetchWithTimeout('/api/test')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps HTTP failures even when the error body is malformed', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('<html>nope</html>', {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'text/html' },
      })
    );

    const caught = await fetchWithTimeout('/api/test').catch(error => error);
    expect(caught).toBeInstanceOf(FetchError);
    expect((caught as FetchError).kind).toBe('http');
    expect((caught as FetchError).status).toBe(400);
    expect((caught as FetchError).message).toBe(
      'Fetch failed: 400 Bad Request'
    );
    expect(caught instanceof FetchDecodeError).toBe(false);
  });

  it('wraps a transport TypeError as a retryable network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const caught = await fetchWithTimeout('/api/test').catch(error => error);
    expect(caught).toBeInstanceOf(FetchNetworkError);
    expect((caught as FetchError).kind).toBe('network');
    expect((caught as FetchError).isRetryable()).toBe(true);
    expect((caught as FetchError).cause).toBeInstanceOf(TypeError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns a successful small JSON payload', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'ok' }));

    await expect(
      fetchWithTimeout('/api/test', {
        schema: z.object({ id: z.string() }),
      })
    ).resolves.toEqual({ id: 'ok' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not impose the first-byte timeout on a legitimate slow stream', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('late-chunk'));
              controller.close();
            }, 80);
          },
        }),
        { status: 200, headers: { 'content-type': 'text/plain' } }
      )
    );

    const response = await fetchWithTimeoutResponse('/api/stream', {
      timeout: 20,
    });
    await expect(response.text()).resolves.toBe('late-chunk');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('releases abort listeners after repeated calls sharing one external signal', async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    for (let index = 0; index < 4; index += 1) {
      mockFetch.mockResolvedValueOnce(jsonResponse({ index }));
      await expect(
        fetchWithTimeout('/api/test', { signal: controller.signal })
      ).resolves.toEqual({ index });
    }

    expect(addSpy.mock.calls.length).toBeGreaterThan(0);
    expect(removeSpy.mock.calls.length).toBe(addSpy.mock.calls.length);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

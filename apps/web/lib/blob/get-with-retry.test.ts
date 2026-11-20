import { get as mockGet } from '@vercel/blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobWithRetry, isTransientBlobReadError } from './get-with-retry';

vi.mock('@vercel/blob', () => ({ get: vi.fn() }));

const mockGetTyped = vi.mocked(mockGet);

function blobFetchError(status: number, statusText: string): Error {
  return new Error(
    `Vercel Blob: Failed to fetch blob: ${status} ${statusText}`
  );
}

describe('isTransientBlobReadError', () => {
  it('retries upstream 5xx blob fetch failures', () => {
    expect(
      isTransientBlobReadError(blobFetchError(500, 'Internal Server Error'))
    ).toBe(true);
    expect(
      isTransientBlobReadError(blobFetchError(503, 'Service Unavailable'))
    ).toBe(true);
  });

  it('retries 429 blob fetch failures', () => {
    expect(
      isTransientBlobReadError(blobFetchError(429, 'Too Many Requests'))
    ).toBe(true);
  });

  it('does not retry client-error blob fetch failures', () => {
    expect(isTransientBlobReadError(blobFetchError(403, 'Forbidden'))).toBe(
      false
    );
    expect(isTransientBlobReadError(blobFetchError(400, 'Bad Request'))).toBe(
      false
    );
  });

  it('retries raw network failures without an HTTP status', () => {
    expect(isTransientBlobReadError(new TypeError('fetch failed'))).toBe(true);
    expect(
      isTransientBlobReadError(new Error('network error: ECONNRESET'))
    ).toBe(true);
  });

  it('does not retry unrelated blob errors or non-errors', () => {
    expect(isTransientBlobReadError(new Error('Access denied'))).toBe(false);
    expect(isTransientBlobReadError('Failed to fetch blob: 500')).toBe(false);
  });

  it.each(['AbortError', 'TimeoutError'])(
    'does not retry %s even when its message mentions the network',
    name => {
      const error = new Error('network request cancelled');
      error.name = name;
      expect(isTransientBlobReadError(error)).toBe(false);
    }
  );
});

describe('getBlobWithRetry cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetTyped.mockReset();
  });

  afterEach(() => {
    mockGetTyped.mockReset();
    vi.useRealTimers();
  });

  it('preserves an already-aborted signal reason without starting a read', async () => {
    const reason = new Error('network request cancelled');
    const signal = AbortSignal.abort(reason);
    mockGetTyped.mockRejectedValue(reason);
    const rejection = expect(
      getBlobWithRetry('p', { access: 'private', abortSignal: signal }, 'test')
    ).rejects.toBe(reason);

    await vi.runAllTimersAsync();
    await rejection;
    expect(mockGetTyped).not.toHaveBeenCalled();
  });

  it('cancels during backoff immediately and never starts another read', async () => {
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    mockGetTyped.mockRejectedValue(blobFetchError(503, 'Service Unavailable'));
    const rejected = vi.fn();
    const read = getBlobWithRetry(
      'p',
      { access: 'private', abortSignal: controller.signal },
      'test'
    ).catch(rejected);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockGetTyped).toHaveBeenCalledTimes(1);

    controller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);

    await vi.runAllTimersAsync();
    await read;
    expect(mockGetTyped).toHaveBeenCalledTimes(1);
  });

  it('preserves cancellation of an in-flight read without retrying its reason', async () => {
    const controller = new AbortController();
    const reason = new Error('network request cancelled');
    mockGetTyped.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(reason), {
            once: true,
          });
        })
    );
    const rejection = expect(
      getBlobWithRetry(
        'p',
        { access: 'private', abortSignal: controller.signal },
        'test'
      )
    ).rejects.toBe(reason);

    controller.abort(reason);
    await vi.runAllTimersAsync();
    await rejection;
    expect(mockGetTyped).toHaveBeenCalledTimes(1);
  });

  it('removes its abort listener after a successful read', async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const result = { statusCode: 200 } as never;
    mockGetTyped.mockResolvedValueOnce(result);

    await expect(
      getBlobWithRetry(
        'p',
        { access: 'private', abortSignal: controller.signal },
        'test'
      )
    ).resolves.toBe(result);

    expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0][1]);
  });
});

describe('getBlobWithRetry response fixtures', () => {
  beforeEach(() => {
    mockGetTyped.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockGetTyped.mockReset();
    vi.useRealTimers();
  });

  it.each([null, { statusCode: 304, stream: null }])(
    'returns a missing or conditional-read result unchanged: %j',
    async result => {
      mockGetTyped.mockResolvedValueOnce(result as never);
      await expect(
        getBlobWithRetry('fixture/media', { access: 'private' }, 'test')
      ).resolves.toBe(result);
      expect(mockGetTyped).toHaveBeenCalledTimes(1);
    }
  );

  it('retries a 503 without consuming or replacing the eventual body and headers', async () => {
    const response = new Response('fixture media', {
      headers: { 'content-range': 'bytes 0-12/13', etag: 'fixture-etag' },
    });
    const result = {
      statusCode: 200,
      stream: response.body,
      headers: response.headers,
    } as never;
    const signal = new AbortController().signal;
    const options = {
      access: 'private',
      abortSignal: signal,
      useCache: false,
      headers: { Range: 'bytes=0-12' },
    } as const;
    mockGetTyped
      .mockRejectedValueOnce(blobFetchError(503, 'Service Unavailable'))
      .mockResolvedValueOnce(result);

    const read = getBlobWithRetry('fixture/media', options, 'test');
    await vi.runAllTimersAsync();
    await expect(read).resolves.toBe(result);
    vi.useRealTimers();

    expect(mockGetTyped).toHaveBeenCalledTimes(2);
    expect(mockGetTyped).toHaveBeenNthCalledWith(1, 'fixture/media', options);
    expect(mockGetTyped).toHaveBeenNthCalledWith(2, 'fixture/media', options);
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe('fixture media');
  });
});

describe('getBlobWithRetry', () => {
  it('passes the pathname and options through to the SDK unchanged', async () => {
    const options = { access: 'private', useCache: false } as const;
    mockGetTyped.mockResolvedValueOnce({ statusCode: 200 } as never);

    await getBlobWithRetry('some/path.json', options, 'test.readBlob');

    expect(mockGetTyped).toHaveBeenCalledWith('some/path.json', options);
  });

  it('retries a transient upstream 5xx and returns the eventual result', async () => {
    mockGetTyped
      .mockRejectedValueOnce(blobFetchError(500, 'Internal Server Error'))
      .mockResolvedValueOnce({ ok: true } as never);

    await expect(
      getBlobWithRetry('p', { access: 'private' }, 'test.readBlob')
    ).resolves.toEqual({
      ok: true,
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    mockGetTyped.mockRejectedValue(blobFetchError(403, 'Forbidden'));

    await expect(
      getBlobWithRetry('p', { access: 'private' }, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 403 Forbidden',
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting the bounded retries', async () => {
    mockGetTyped.mockRejectedValue(blobFetchError(503, 'Service Unavailable'));

    await expect(
      getBlobWithRetry('p', { access: 'private' }, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 503 Service Unavailable',
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(3);
  });
});

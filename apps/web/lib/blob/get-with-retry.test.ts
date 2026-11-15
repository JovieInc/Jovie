import { get as mockGet } from '@vercel/blob';
import { describe, expect, it, vi } from 'vitest';
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

    await expect(getBlobWithRetry('p', {}, 'test.readBlob')).resolves.toEqual({
      ok: true,
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    mockGetTyped.mockRejectedValue(blobFetchError(403, 'Forbidden'));

    await expect(
      getBlobWithRetry('p', {}, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 403 Forbidden',
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting the bounded retries', async () => {
    mockGetTyped.mockRejectedValue(blobFetchError(503, 'Service Unavailable'));

    await expect(
      getBlobWithRetry('p', {}, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 503 Service Unavailable',
    });
    expect(mockGetTyped).toHaveBeenCalledTimes(3);
  });
});

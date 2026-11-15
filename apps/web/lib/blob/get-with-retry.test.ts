import { describe, expect, it, vi } from 'vitest';
import { getBlobWithRetry, isTransientBlobReadError } from './get-with-retry';

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
  it('retries a transient upstream 5xx and returns the eventual result', async () => {
    const operation = vi
      .fn<() => Promise<{ ok: boolean }>>()
      .mockRejectedValueOnce(blobFetchError(500, 'Internal Server Error'))
      .mockResolvedValue({ ok: true });

    await expect(getBlobWithRetry(operation, 'test.readBlob')).resolves.toEqual(
      { ok: true }
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const operation = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(blobFetchError(403, 'Forbidden'));

    await expect(
      getBlobWithRetry(operation, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 403 Forbidden',
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting the bounded retries', async () => {
    const operation = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(blobFetchError(503, 'Service Unavailable'));

    await expect(
      getBlobWithRetry(operation, 'test.readBlob')
    ).rejects.toMatchObject({
      message: 'Vercel Blob: Failed to fetch blob: 503 Service Unavailable',
    });
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

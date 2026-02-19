import { describe, expect, it, vi } from 'vitest';
import { formatPacerError, toPacerError } from '@/lib/pacer/errors';
import {
  executeWithRetry,
  shouldRetryPacerNetworkError,
} from '@/lib/pacer/hooks/retry';

describe('pacer retry utilities', () => {
  it('retries transient failures and eventually succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok');

    const result = await executeWithRetry(operation, {
      maxAttempts: 2,
      baseWait: 1,
      backoff: 'fixed',
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable failures', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('HTTP 400 bad request'));

    await expect(
      executeWithRetry(operation, {
        maxAttempts: 3,
        baseWait: 1,
        backoff: 'fixed',
      })
    ).rejects.toThrow('HTTP 400 bad request');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('formats unknown errors into user-friendly Error objects', () => {
    const result = toPacerError('boom', {
      customMessages: {
        unknown: 'Validation failed',
      },
    });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Validation failed');
  });

  it('classifies retryable network/timeouts correctly', () => {
    expect(shouldRetryPacerNetworkError(new Error('network offline'))).toBe(
      true
    );
    expect(shouldRetryPacerNetworkError(new Error('HTTP 503'))).toBe(true);
    expect(shouldRetryPacerNetworkError(new Error('HTTP 429'))).toBe(false);
    expect(formatPacerError(new Error('HTTP 503'))).toBe(
      'Server error - please try again'
    );
  });
});

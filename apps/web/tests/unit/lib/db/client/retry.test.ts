import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DbCircuitOpenError,
  dbCircuitBreaker,
} from '@/lib/db/client/circuit-breaker';
import { isRetryableError, withRetry } from '@/lib/db/client/retry';

describe('isRetryableError', () => {
  it('returns true for connection reset errors', () => {
    expect(isRetryableError(new Error('connection reset by peer'))).toBe(true);
  });

  it('returns true for timeout errors', () => {
    expect(isRetryableError(new Error('timeout exceeded'))).toBe(true);
  });

  it('returns true for plain object errors with retryable message text', () => {
    expect(
      isRetryableError({ message: 'server conn crashed?', name: 'DbError' })
    ).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('syntax error in SQL'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    dbCircuitBreaker.reset();
  });
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'), 'test', 3);
    expect(result).toBe('ok');
  });

  it('retries on retryable errors and succeeds', async () => {
    let attempt = 0;
    const operation = vi.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error('connection reset by peer');
      return 'recovered';
    });

    const result = await withRetry(operation, 'test-retry', 3);
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on non-retryable errors', async () => {
    const operation = vi.fn(async () => {
      throw new Error('syntax error in SQL');
    });

    await expect(withRetry(operation, 'test-no-retry', 3)).rejects.toThrow(
      'syntax error in SQL'
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('fails fast with 503 once circuit is open', async () => {
    const operation = vi.fn(async () => {
      throw new Error('connection reset by peer');
    });

    for (let i = 0; i < 5; i++) {
      await expect(withRetry(operation, 'trip-circuit', 1)).rejects.toThrow(
        'connection reset by peer'
      );
    }

    await expect(
      withRetry(operation, 'trip-circuit', 1)
    ).rejects.toBeInstanceOf(DbCircuitOpenError);
  });

  it('throws after exhausting all retries', async () => {
    const operation = vi.fn(async () => {
      throw new Error('connection reset by peer');
    });

    await expect(withRetry(operation, 'test-exhaust', 2)).rejects.toThrow(
      'connection reset by peer'
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

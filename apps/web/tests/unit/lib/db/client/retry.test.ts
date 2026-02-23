import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DbCircuitOpenError,
  dbCircuitBreaker,
} from '@/lib/db/client/circuit-breaker';
import { withRetry } from '@/lib/db/client/retry';
import { DB_CIRCUIT_BREAKER_CONFIG } from '@/lib/db/config';

const RETRYABLE_ERROR_MESSAGE = 'connection reset by peer';

async function openCircuit(): Promise<void> {
  for (let i = 0; i < DB_CIRCUIT_BREAKER_CONFIG.failureThreshold; i++) {
    await expect(
      withRetry(
        () => Promise.reject(new Error(RETRYABLE_ERROR_MESSAGE)),
        'test-circuit-open',
        1
      )
    ).rejects.toBeInstanceOf(Error);
  }
}

describe('withRetry circuit breaker', () => {
  beforeEach(() => {
    dbCircuitBreaker.reset();
  });

  it('fails fast with DbCircuitOpenError when circuit is open', async () => {
    await openCircuit();

    const operation = vi.fn(() => Promise.resolve('ok'));

    await expect(
      withRetry(operation, 'test-fast-fail', 1)
    ).rejects.toBeInstanceOf(DbCircuitOpenError);
    expect(operation).not.toHaveBeenCalled();
  });

  it('exposes status and retryAfterSeconds on circuit open error', async () => {
    await openCircuit();

    try {
      await withRetry(() => Promise.resolve('ok'), 'test-error-shape', 1);
    } catch (error) {
      expect(error).toBeInstanceOf(DbCircuitOpenError);
      if (error instanceof DbCircuitOpenError) {
        expect(error.status).toBe(503);
        expect(error.retryAfterSeconds).toBe(
          Math.ceil(DB_CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000)
        );
        expect(error.stats.state).toBe('OPEN');
      }
    }
  });
});

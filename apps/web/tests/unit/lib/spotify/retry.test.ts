import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import {
  type CircuitBreakerStats,
  CircuitOpenError,
} from '@/lib/spotify/circuit-breaker';
import { withRetry } from '@/lib/spotify/retry';

/**
 * Zero-delay config so tests exercise the full retry loop without sleeping.
 */
const FAST_CONFIG = {
  maxRetries: 2,
  baseDelay: 0,
  maxDelay: 0,
  jitter: 0,
} as const;

function openCircuitStats(): CircuitBreakerStats {
  return {
    state: 'OPEN',
    failures: 10,
    successes: 0,
    lastFailureTime: Date.now(),
    lastStateChange: Date.now(),
    totalFailures: 10,
    totalSuccesses: 0,
    requestsInWindow: 20,
  };
}

describe('withRetry exhaustion capture severity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures exhausted vendor 5xx failures at warning level', async () => {
    const error = Object.assign(new Error('Spotify returned 503'), {
      status: 503,
    });

    const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(FAST_CONFIG.maxRetries + 1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        level: 'warning',
        tags: { component: 'spotify-retry' },
      })
    );
  });

  it('captures rate-limit failures still present after retry at warning level', async () => {
    const error = Object.assign(new Error('Spotify rate limited'), {
      status: 429,
      retryAfter: 0,
    });

    const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

    expect(result.success).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('captures IngestError-style transient codes at warning level', async () => {
    for (const code of [
      'SPOTIFY_UNAVAILABLE',
      'SPOTIFY_RATE_LIMITED',
      'RATE_LIMITED',
    ]) {
      vi.clearAllMocks();
      const error = Object.assign(new Error(`coded failure: ${code}`), {
        code,
      });

      const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

      expect(result.success).toBe(false);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ level: 'warning' })
      );
    }
  });

  it('captures circuit-breaker-open errors at warning level', async () => {
    const error = new CircuitOpenError(
      'Circuit breaker is OPEN. Service unavailable.',
      openCircuitStats()
    );

    const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

    expect(result.success).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('keeps error level for unexpected non-retryable failures', async () => {
    const error = new Error('unexpected boom');

    const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ level: 'error' })
    );
  });

  it('keeps error level for non-transient HTTP statuses', async () => {
    const error = Object.assign(new Error('Spotify returned 400'), {
      status: 400,
      code: 'SPOTIFY_API_ERROR',
    });

    const result = await withRetry(() => Promise.reject(error), FAST_CONFIG);

    expect(result.success).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ level: 'error' })
    );
  });

  it('does not capture when a retry recovers', async () => {
    const error = Object.assign(new Error('Spotify returned 503'), {
      status: 503,
    });
    let calls = 0;
    const operation = vi.fn(() => {
      calls++;
      return calls < 3 ? Promise.reject(error) : Promise.resolve('ok');
    });

    const result = await withRetry(operation, FAST_CONFIG);

    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

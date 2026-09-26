import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FetchCanceledError,
  FetchDeadlineError,
  FetchDecodeError,
  FetchError,
  FetchNetworkError,
  FetchPayloadLimitError,
} from './fetch';
import {
  createClassifiedQueryRetryPolicy,
  defaultQueryRetryPolicy,
  isRetryableQueryError,
  parseRetryAfterMs,
  QUERY_RETRY_AFTER_MAX_MS,
  QUERY_RETRY_MAX_DELAY_MS,
  QUERY_RETRY_MAX_RETRIES,
} from './retry-policy';

function httpError(status: number, retryAfter?: string): FetchError {
  const response = new Response(null, {
    status,
    headers: retryAfter ? { 'retry-after': retryAfter } : undefined,
  });
  return new FetchError(`HTTP ${status}`, status, response);
}

describe('classified query retry policy (JOV-6185)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isRetryableQueryError', () => {
    it('never retries intentional cancellation', () => {
      expect(isRetryableQueryError(new FetchCanceledError())).toBe(false);
      const abort = new Error('Aborted');
      abort.name = 'AbortError';
      expect(isRetryableQueryError(abort)).toBe(false);
    });

    it('never retries ordinary 4xx auth/validation failures', () => {
      for (const status of [400, 401, 403, 404, 409, 422]) {
        expect(isRetryableQueryError(httpError(status))).toBe(false);
      }
    });

    it('never retries decode/schema or payload-limit failures', () => {
      expect(isRetryableQueryError(new FetchDecodeError())).toBe(false);
      expect(isRetryableQueryError(new FetchPayloadLimitError())).toBe(false);
    });

    it('never retries unclassified domain errors', () => {
      expect(isRetryableQueryError(new Error('validation failed'))).toBe(false);
      expect(isRetryableQueryError('string error')).toBe(false);
      expect(isRetryableQueryError(undefined)).toBe(false);
    });

    it('retries transient network, timeout, 5xx, and rate-limit failures', () => {
      expect(isRetryableQueryError(new FetchNetworkError())).toBe(true);
      expect(isRetryableQueryError(new FetchDeadlineError())).toBe(true);
      expect(isRetryableQueryError(httpError(500))).toBe(true);
      expect(isRetryableQueryError(httpError(503))).toBe(true);
      expect(isRetryableQueryError(httpError(408))).toBe(true);
      expect(isRetryableQueryError(httpError(429))).toBe(true);
    });
  });

  describe('retry bound', () => {
    it('stops a retryable error after the bounded attempt count', () => {
      const error = new FetchNetworkError();
      // TanStack passes the retry count so far: 0 after the first failure.
      expect(defaultQueryRetryPolicy.retry(0, error)).toBe(true);
      expect(
        defaultQueryRetryPolicy.retry(QUERY_RETRY_MAX_RETRIES - 1, error)
      ).toBe(true);
      expect(
        defaultQueryRetryPolicy.retry(QUERY_RETRY_MAX_RETRIES, error)
      ).toBe(false);
    });

    it('stops on the first failure for non-retryable errors', () => {
      expect(defaultQueryRetryPolicy.retry(1, httpError(403))).toBe(false);
      expect(defaultQueryRetryPolicy.retry(1, new FetchDecodeError())).toBe(
        false
      );
    });

    it('enforces the wall-clock budget across a retry cycle', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const policy = createClassifiedQueryRetryPolicy({
        maxRetries: 10,
        budgetMs: 1_000,
      });
      const error = new FetchNetworkError();

      expect(policy.retry(0, error)).toBe(true);
      vi.setSystemTime(1_500);
      expect(policy.retry(1, error)).toBe(false);
    });

    it('resets the wall-clock budget when a new operation starts', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const policy = createClassifiedQueryRetryPolicy({
        maxRetries: 10,
        budgetMs: 1_000,
      });
      const error = new FetchNetworkError();

      expect(policy.retry(1, error)).toBe(true);
      vi.setSystemTime(5_000);
      // failureCount returning to 0 signals a new operation cycle.
      expect(policy.retry(0, error)).toBe(true);
    });
  });

  describe('retryDelay', () => {
    it('honors Retry-After seconds for 429 within the cap', () => {
      expect(parseRetryAfterMs(httpError(429, '5'))).toBe(5_000);
      expect(defaultQueryRetryPolicy.retryDelay(0, httpError(429, '5'))).toBe(
        5_000
      );
    });

    it('caps excessive Retry-After hints', () => {
      expect(parseRetryAfterMs(httpError(429, '120'))).toBe(
        QUERY_RETRY_AFTER_MAX_MS
      );
    });

    it('ignores Retry-After on non-429 errors and unparsable headers', () => {
      expect(parseRetryAfterMs(httpError(500, '5'))).toBeUndefined();
      expect(parseRetryAfterMs(httpError(429, 'not-a-date'))).toBeUndefined();
      expect(parseRetryAfterMs(new FetchNetworkError())).toBeUndefined();
    });

    it('returns bounded exponential backoff with jitter', () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const delay = defaultQueryRetryPolicy.retryDelay(
          attempt,
          new FetchNetworkError()
        );
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(QUERY_RETRY_MAX_DELAY_MS * 1.25 + 1);
      }
    });
  });
});

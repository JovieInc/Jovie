import { describe, expect, it } from 'vitest';
import {
  FetchCanceledError,
  FetchDeadlineError,
  FetchDecodeError,
  FetchError,
  FetchNetworkError,
  FetchPayloadLimitError,
} from '@/lib/queries/fetch';
import {
  classifiedQueryRetry,
  classifiedRetryDelay,
  createClassifiedRetry,
  isRetryableQueryError,
  QUERY_RETRY_AFTER_MAX_MS,
  QUERY_RETRY_BASE_DELAY_MS,
  QUERY_RETRY_JITTER_MS,
  QUERY_RETRY_MAX_ATTEMPTS,
  QUERY_RETRY_MAX_DELAY_MS,
  QUERY_RETRY_WALL_CLOCK_BUDGET_MS,
} from '@/lib/queries/retry-policy';

function httpError(
  status: number,
  headers?: Record<string, string>
): FetchError {
  const response = new Response(null, { status, headers });
  return new FetchError(`HTTP ${status}`, status, response, undefined, {
    kind: 'http',
  });
}

describe('classified retry policy (JOV-6185)', () => {
  describe('isRetryableQueryError', () => {
    it('never retries intentional cancellation', () => {
      expect(isRetryableQueryError(new FetchCanceledError())).toBe(false);
      expect(
        isRetryableQueryError(new DOMException('Aborted', 'AbortError'))
      ).toBe(false);
    });

    it('never retries decode/schema or payload-limit failures', () => {
      expect(isRetryableQueryError(new FetchDecodeError())).toBe(false);
      expect(isRetryableQueryError(new FetchPayloadLimitError())).toBe(false);
    });

    it.each([400, 401, 403, 404, 422])(
      'never retries ordinary 4xx status %i',
      status => {
        expect(isRetryableQueryError(httpError(status))).toBe(false);
      }
    );

    it.each([408, 429, 500, 502, 503])(
      'retries transient HTTP status %i',
      status => {
        expect(isRetryableQueryError(httpError(status))).toBe(true);
      }
    );

    it('retries network failures and request deadlines', () => {
      expect(isRetryableQueryError(new FetchNetworkError())).toBe(true);
      expect(isRetryableQueryError(new FetchDeadlineError())).toBe(true);
    });

    it('does not retry unclassified errors', () => {
      expect(isRetryableQueryError(new Error('boom'))).toBe(false);
      expect(isRetryableQueryError('boom')).toBe(false);
    });
  });

  describe('classifiedQueryRetry', () => {
    it('bounds retryable failures to QUERY_RETRY_MAX_ATTEMPTS', () => {
      const error = new FetchNetworkError();
      // failureCount is 0-based retries already attempted.
      for (
        let failureCount = 0;
        failureCount < QUERY_RETRY_MAX_ATTEMPTS;
        failureCount++
      ) {
        expect(classifiedQueryRetry(failureCount, error)).toBe(true);
      }
      expect(classifiedQueryRetry(QUERY_RETRY_MAX_ATTEMPTS, error)).toBe(false);
    });

    it('stops on the first non-retryable failure', () => {
      expect(classifiedQueryRetry(0, httpError(401))).toBe(false);
      expect(classifiedQueryRetry(0, new FetchCanceledError())).toBe(false);
      expect(classifiedQueryRetry(0, new FetchDecodeError())).toBe(false);
    });

    it('createClassifiedRetry applies a tighter bound', () => {
      const once = createClassifiedRetry(1);
      const error = new FetchNetworkError();
      expect(once(0, error)).toBe(true);
      expect(once(1, error)).toBe(false);
    });
  });

  describe('classifiedRetryDelay', () => {
    it('honors bounded Retry-After delta-seconds on 429', () => {
      const error = httpError(429, { 'retry-after': '5' });
      expect(classifiedRetryDelay(0, error)).toBe(5000);
    });

    it('caps Retry-After at QUERY_RETRY_AFTER_MAX_MS', () => {
      const error = httpError(429, { 'retry-after': '600' });
      expect(classifiedRetryDelay(0, error)).toBe(QUERY_RETRY_AFTER_MAX_MS);
    });

    it('honors bounded Retry-After HTTP-date on 503', () => {
      const at = new Date(Date.now() + 4000).toUTCString();
      const error = httpError(503, { 'retry-after': at });
      const delay = classifiedRetryDelay(0, error);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(4000);
    });

    it('applies capped exponential backoff with jitter otherwise', () => {
      const error = new FetchNetworkError();
      for (let attempt = 0; attempt < 6; attempt++) {
        const delay = classifiedRetryDelay(attempt, error);
        const expectedBase = Math.min(
          QUERY_RETRY_BASE_DELAY_MS * 2 ** attempt,
          QUERY_RETRY_MAX_DELAY_MS
        );
        expect(delay).toBeGreaterThanOrEqual(expectedBase);
        expect(delay).toBeLessThanOrEqual(expectedBase + QUERY_RETRY_JITTER_MS);
      }
    });
  });

  it('keeps the retry chain inside the declared wall-clock budget', () => {
    // Worst case: every retry waits the max delay and every attempt (initial
    // + retries) burns the default 10s transport deadline.
    expect(QUERY_RETRY_WALL_CLOCK_BUDGET_MS).toBe(
      QUERY_RETRY_MAX_ATTEMPTS * QUERY_RETRY_MAX_DELAY_MS +
        (QUERY_RETRY_MAX_ATTEMPTS + 1) * 10_000
    );
    expect(QUERY_RETRY_WALL_CLOCK_BUDGET_MS).toBeLessThanOrEqual(90_000);
  });
});

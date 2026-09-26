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
  classifiedQueryRetryDelay,
  isRetryableQueryError,
  QUERY_MAX_RETRIES,
  QUERY_RETRY_AFTER_MAX_MS,
  QUERY_RETRY_MAX_DELAY_MS,
  retryAfterDelayMs,
} from '@/lib/queries/retry-policy';

function httpError(
  status: number,
  headers?: Record<string, string>
): FetchError {
  const response = new Response('{}', { status, headers });
  return new FetchError(`HTTP ${status}`, status, response, undefined, {
    kind: 'http',
  });
}

describe('classified query retry policy (JOV-6185)', () => {
  describe('isRetryableQueryError', () => {
    it('does not retry intentional cancellation', () => {
      expect(isRetryableQueryError(new FetchCanceledError())).toBe(false);
      expect(
        isRetryableQueryError(
          Object.assign(new Error('aborted'), { name: 'AbortError' })
        )
      ).toBe(false);
    });

    it('does not retry auth and ordinary 4xx failures', () => {
      for (const status of [400, 401, 403, 404, 422]) {
        expect(isRetryableQueryError(httpError(status))).toBe(false);
      }
    });

    it('does not retry decode or payload-limit failures', () => {
      expect(isRetryableQueryError(new FetchDecodeError())).toBe(false);
      expect(isRetryableQueryError(new FetchPayloadLimitError())).toBe(false);
    });

    it('does not retry non-transport errors', () => {
      expect(isRetryableQueryError(new Error('boom'))).toBe(false);
      expect(isRetryableQueryError('boom')).toBe(false);
      expect(isRetryableQueryError(null)).toBe(false);
    });

    it('retries network, deadline, and retryable HTTP statuses', () => {
      expect(isRetryableQueryError(new FetchNetworkError())).toBe(true);
      expect(isRetryableQueryError(new FetchDeadlineError())).toBe(true);
      for (const status of [408, 429, 500, 502, 503]) {
        expect(isRetryableQueryError(httpError(status))).toBe(true);
      }
    });
  });

  describe('classifiedQueryRetry', () => {
    it('bounds transient retries to QUERY_MAX_RETRIES retries', () => {
      // TanStack passes the count of completed retries: 0 on first failure.
      const error = httpError(503);
      for (let failure = 0; failure < QUERY_MAX_RETRIES; failure += 1) {
        expect(classifiedQueryRetry(failure, error)).toBe(true);
      }
      expect(classifiedQueryRetry(QUERY_MAX_RETRIES, error)).toBe(false);
    });

    it('stops immediately on non-retryable failures at any count', () => {
      expect(classifiedQueryRetry(1, httpError(401))).toBe(false);
      expect(classifiedQueryRetry(1, new FetchCanceledError())).toBe(false);
      expect(classifiedQueryRetry(1, new FetchDecodeError())).toBe(false);
      expect(classifiedQueryRetry(1, new Error('boom'))).toBe(false);
    });
  });

  describe('classifiedQueryRetryDelay', () => {
    it('honors a bounded Retry-After seconds header on 429', () => {
      const error = httpError(429, { 'retry-after': '2' });
      expect(classifiedQueryRetryDelay(0, error)).toBe(2000);
      expect(retryAfterDelayMs(error)).toBe(2000);
    });

    it('clamps an excessive Retry-After hint to the policy bound', () => {
      const error = httpError(429, { 'retry-after': '600' });
      expect(classifiedQueryRetryDelay(0, error)).toBe(
        QUERY_RETRY_AFTER_MAX_MS
      );
    });

    it('honors Retry-After on 503 but ignores it on other statuses', () => {
      expect(retryAfterDelayMs(httpError(503, { 'retry-after': '1' }))).toBe(
        1000
      );
      expect(retryAfterDelayMs(httpError(500, { 'retry-after': '1' }))).toBe(
        undefined
      );
      expect(retryAfterDelayMs(httpError(404, { 'retry-after': '1' }))).toBe(
        undefined
      );
    });

    it('ignores malformed Retry-After headers', () => {
      expect(
        retryAfterDelayMs(httpError(429, { 'retry-after': 'soon' }))
      ).toBeUndefined();
      expect(retryAfterDelayMs(httpError(429))).toBeUndefined();
      expect(retryAfterDelayMs(new FetchNetworkError())).toBeUndefined();
    });

    it('backs off exponentially with jitter bounded by the max delay', () => {
      const error = httpError(500);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const delay = classifiedQueryRetryDelay(attempt, error);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(QUERY_RETRY_MAX_DELAY_MS);
      }
      const base = classifiedQueryRetryDelay(0, error);
      expect(base).toBeLessThanOrEqual(1250);
    });
  });
});

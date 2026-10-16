import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isTransientStripeError,
  StripeRetryExhaustedError,
  withStripeRetry,
} from '@/lib/stripe/retry';

// Observability is an external sink; exercise the real retry implementation.
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));

const transientTypes = [
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
];

// Idempotency errors and HTTP 409 await caller key-policy validation (JOV-8584).
describe('isTransientStripeError', () => {
  it.each(transientTypes)('recognizes type %s without other signals', type => {
    expect(isTransientStripeError({ type })).toBe(true);
  });

  it.each(transientTypes)('recognizes Error name %s alone', name => {
    const error = Object.assign(new Error('Stripe request failed'), { name });
    expect(isTransientStripeError(error)).toBe(true);
  });

  it.each([408, 429, 500, 502, 503, 504])(
    'recognizes numeric status %s without type or message',
    statusCode => {
      expect(isTransientStripeError({ statusCode })).toBe(true);
    }
  );

  it.each([
    'CONNECTION interrupted',
    'Request TIMEOUT',
    'Service TEMPORARILY UNAVAILABLE',
    'RATE LIMIT exceeded',
  ])('recognizes message %s without type or status', message => {
    expect(isTransientStripeError(new Error(message))).toBe(true);
  });

  it.each([
    null,
    undefined,
    false,
    503,
    'connection timeout',
    {},
    { type: 'StripeInvalidRequestError' },
    { type: 503 },
    { name: 'StripeConnectionError' },
    { message: 'connection timeout' },
    { statusCode: '503' },
    { statusCode: 400 },
    new Error('Invalid card'),
  ])('rejects permanent or malformed input %j', error => {
    expect(isTransientStripeError(error)).toBe(false);
  });
});

describe('withStripeRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the original successful result without retrying', async () => {
    const value = { id: 'cs_success' };
    const operation = vi.fn().mockResolvedValue(value);

    await expect(withStripeRetry('checkout', operation)).resolves.toBe(value);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 1])(
    'preserves a permanent failure after %s transient failures',
    async transientFailures => {
      const permanent = new Error('Invalid card');
      const operation = vi.fn().mockRejectedValue(permanent);
      if (transientFailures) {
        operation.mockRejectedValueOnce({ type: 'StripeConnectionError' });
      }
      const result = withStripeRetry('checkout', operation).then(
        () => ({ rejected: false, error: undefined }),
        (error: unknown) => ({ rejected: true, error })
      );

      await vi.runAllTimersAsync();

      const outcome = await result;
      expect(outcome.rejected).toBe(true);
      expect(outcome.error).toBe(permanent);
      expect(operation).toHaveBeenCalledTimes(transientFailures + 1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([
    [0, 1],
    [1, 2],
    [3, 4],
    [undefined, 3],
  ] as const)(
    'exhausts maxRetries=%s after exactly %s attempts',
    async (maxRetries, attempts) => {
      const failures = Array.from({ length: attempts }, (_, index) =>
        Object.assign(new Error(`Outage ${index}`), {
          type: 'StripeConnectionError',
        })
      );
      const operation = vi.fn();
      for (const failure of failures) operation.mockRejectedValueOnce(failure);
      // An extra attempt would incorrectly succeed and expose an unbounded budget.
      operation.mockResolvedValue({ id: 'unexpected_success' });
      const result = withStripeRetry(
        'checkout',
        operation,
        maxRetries === undefined ? undefined : { maxRetries, baseDelayMs: 10 }
      ).then(
        () => ({ rejected: false, error: undefined }),
        (error: unknown) => ({ rejected: true, error })
      );

      await vi.runAllTimersAsync();

      const { rejected, error } = await result;
      expect(rejected).toBe(true);
      expect(error).toBeInstanceOf(StripeRetryExhaustedError);
      expect(error).toMatchObject({
        name: 'StripeRetryExhaustedError',
        operation: 'checkout',
        attempts,
      });
      expect((error as StripeRetryExhaustedError).cause).toBe(failures.at(-1));
      expect(operation).toHaveBeenCalledTimes(attempts);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([
    [0, 100, 75, 150],
    [0.5, 100, 100, 200],
    [0.999, 100, 125, 250],
    [0.5, undefined, 500, 1000],
  ] as const)(
    'recovers with random=%s and baseDelayMs=%s after %s then %s ms',
    async (random, baseDelayMs, firstDelay, secondDelay) => {
      vi.mocked(Math.random).mockReturnValue(random);
      const value = { id: 'cs_recovered' };
      const operation = vi
        .fn()
        .mockRejectedValueOnce({ type: 'StripeRateLimitError' })
        .mockRejectedValueOnce({ statusCode: 503 })
        .mockResolvedValue(value);
      const result = withStripeRetry(
        'checkout',
        operation,
        baseDelayMs === undefined ? undefined : { baseDelayMs }
      ).then(
        value => ({ rejected: false as const, value }),
        (error: unknown) => ({ rejected: true as const, error })
      );

      await vi.advanceTimersByTimeAsync(firstDelay - 1);
      expect(operation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(operation).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(secondDelay - 1);
      expect(operation).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      const outcome = await result;
      expect(outcome.rejected).toBe(false);
      expect('value' in outcome ? outcome.value : undefined).toBe(value);
      expect(operation).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});

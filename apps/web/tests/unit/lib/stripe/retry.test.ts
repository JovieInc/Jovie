import { describe, expect, it, vi } from 'vitest';
import {
  isTransientStripeError,
  StripeRetryExhaustedError,
  withStripeRetry,
} from '@/lib/stripe/retry';

describe('stripe retry utilities', () => {
  it('detects transient Stripe errors by name/type/status', () => {
    expect(
      isTransientStripeError({ type: 'StripeConnectionError', statusCode: 503 })
    ).toBe(true);
    expect(
      isTransientStripeError(
        Object.assign(new Error('request timeout'), {
          name: 'StripeAPIError',
          statusCode: 500,
        })
      )
    ).toBe(true);
    expect(
      isTransientStripeError(
        Object.assign(new Error('invalid request'), {
          name: 'StripeInvalidRequestError',
          statusCode: 400,
        })
      )
    ).toBe(false);
  });

  it('throws StripeRetryExhaustedError after final transient failure', async () => {
    const error = Object.assign(new Error('temporary outage'), {
      name: 'StripeConnectionError',
      type: 'StripeConnectionError',
      statusCode: 503,
    });

    await expect(
      withStripeRetry(
        'createCheckoutSession',
        async () => {
          throw error;
        },
        { maxRetries: 1, baseDelayMs: 1 }
      )
    ).rejects.toBeInstanceOf(StripeRetryExhaustedError);
  });

  it('does not retry non-transient failures', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('invalid card'), {
        name: 'StripeInvalidRequestError',
        type: 'StripeInvalidRequestError',
        statusCode: 400,
      });
    });

    await expect(withStripeRetry('createCheckoutSession', fn)).rejects.toThrow(
      'invalid card'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

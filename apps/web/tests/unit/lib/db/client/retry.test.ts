import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: { NODE_ENV: 'test' },
}));

import * as Sentry from '@sentry/nextjs';
import {
  DbCircuitOpenError,
  dbCircuitBreaker,
} from '@/lib/db/client/circuit-breaker';
import { isRetryableError, withRetry } from '@/lib/db/client/retry';

describe('isRetryableError', () => {
  it('returns true for connection reset errors', () => {
    expect(isRetryableError(new Error('connection reset by peer'))).toBe(true);
  });

  it('does not replay an uncanceled application timeout', () => {
    expect(isRetryableError(new Error('timeout exceeded'))).toBe(false);
  });

  it('returns true for plain object errors with retryable message text', () => {
    expect(
      isRetryableError({ message: 'server conn crashed?', name: 'DbError' })
    ).toBe(true);
  });

  it('returns true when a Failed query wrapper contains a transient nested cause', () => {
    const error = new Error('Failed query: select * from creator_profiles', {
      cause: new Error('Connection terminated unexpectedly'),
    });

    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('syntax error in SQL'))).toBe(false);
  });

  it('returns false for a Failed query wrapper around a permanent SQL error', () => {
    const error = new Error('Failed query: select * from creator_profiles', {
      cause: new Error('column \"foo\" does not exist'),
    });

    expect(isRetryableError(error)).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

const readPolicy = {
  operation: 'read',
  maxAttempts: 3,
  retryBudgetMs: 5000,
} as const;

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dbCircuitBreaker.reset();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(Sentry.addBreadcrumb).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

    const pending = withRetry(operation, 'test-retry', readPolicy);
    await vi.runAllTimersAsync();
    const result = await pending;
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

    const assertion = expect(
      withRetry(operation, 'test-exhaust', { ...readPolicy, maxAttempts: 2 })
    ).rejects.toThrow('connection reset by peer');
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('logs intermediate retryable failures as breadcrumbs, not Sentry exceptions', async () => {
    // JOV-1433: "Failed query:" errors during retry must not be sent to
    // Sentry as exceptions on intermediate attempts — only the final
    // unrecoverable failure should reach Sentry.
    let attempt = 0;
    const operation = vi.fn(async () => {
      attempt++;
      if (attempt < 3) {
        throw new Error('Failed query: SELECT 1', {
          cause: new Error('Connection terminated unexpectedly'),
        });
      }
      return 'ok';
    });

    const pending = withRetry(operation, 'test-breadcrumb', readPolicy);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result).toBe('ok');

    // Intermediate retryable failures: breadcrumb only, no Sentry exception
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
  });

  it('captures final non-retryable failure as Sentry exception, not breadcrumb', async () => {
    const operation = vi.fn(async () => {
      throw new Error('syntax error in SQL');
    });

    await expect(
      withRetry(operation, 'test-final-exception', 3)
    ).rejects.toThrow('syntax error in SQL');

    // Non-retryable: captured as Sentry exception immediately
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('logs exhausted retryable failures as breadcrumbs, not Sentry exceptions', async () => {
    const operation = vi.fn(async () => {
      throw new Error('connection reset by peer');
    });

    const assertion = expect(
      withRetry(operation, 'test-retryable-exhaust', {
        ...readPolicy,
        maxAttempts: 2,
      })
    ).rejects.toThrow('connection reset by peer');

    await vi.runAllTimersAsync();
    await assertion;
    // Retryable errors should be breadcrumbs even on final failure —
    // circuit breaker handles the aggregate alert
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
  });
});

describe('operation-aware retry safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dbCircuitBreaker.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['28P01', '22023', '23505', '42601', '57014', '40001', '40P01'])(
    'does not let transport words override SQLSTATE %s',
    async code => {
      const error = new Error('Failed query: select network_timeout', {
        cause: Object.assign(new Error('temporary connection timeout'), {
          code,
        }),
      });
      const operation = vi.fn().mockRejectedValue(error);
      await expect(withRetry(operation, 'permanent', readPolicy)).rejects.toBe(
        error
      );
      expect(operation).toHaveBeenCalledTimes(1);
    }
  );

  it('does not duplicate a write after commit acknowledgment is lost', async () => {
    let committedWrites = 0;
    const error = new Error('connection reset after commit');
    const operation = vi.fn(async () => {
      committedWrites++;
      throw error;
    });
    const assertion = expect(
      withRetry(operation, 'uncertain-write', 4)
    ).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(committedWrites).toBe(1);
  });

  it('allows one retry owner when read wrappers are nested', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('connection reset'));
    const result = withRetry(
      () => withRetry(operation, 'inner', readPolicy),
      'outer',
      readPolicy
    );
    const assertion = expect(result).rejects.toThrow('connection reset');
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not multiply retries inside an unclassified outer operation', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('connection reset'));
    await expect(
      withRetry(() => withRetry(operation, 'inner', readPolicy), 'outer')
    ).rejects.toThrow('connection reset');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not admit another attempt after the retry budget expires', async () => {
    const error = new Error('connection reset');
    const operation = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 4900));
      throw error;
    });
    const result = withRetry(operation, 'deadline', readPolicy);
    const assertion = expect(result).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks the retry budget again after a delayed timer wakes', async () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(5000);
    const operation = vi.fn().mockRejectedValue(new Error('connection reset'));
    const assertion = expect(
      withRetry(operation, 'oversleep', readPolicy)
    ).rejects.toThrow('connection reset');
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[retry_budget_exhausted] connection reset',
      })
    );
  });

  it('keeps plain-object transport errors intact', async () => {
    const error = { code: '08006', message: 'connection failure' };
    const operation = vi.fn().mockRejectedValue(error);
    const assertion = expect(
      withRetry(operation, 'plain-error', {
        ...readPolicy,
        maxAttempts: 2,
      })
    ).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid attempt counts: %s',
    async maxAttempts => {
      const operation = vi.fn();
      await expect(
        withRetry(operation, 'invalid', { ...readPolicy, maxAttempts })
      ).rejects.toBeInstanceOf(RangeError);
      expect(operation).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid retry budgets: %s',
    async retryBudgetMs => {
      const operation = vi.fn();
      await expect(
        withRetry(operation, 'invalid', { ...readPolicy, retryBudgetMs })
      ).rejects.toBeInstanceOf(RangeError);
      expect(operation).not.toHaveBeenCalled();
    }
  );
});

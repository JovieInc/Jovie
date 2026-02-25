import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

import {
  DbCircuitOpenError,
  dbCircuitBreaker,
} from '@/lib/db/client/circuit-breaker';

describe('dbCircuitBreaker', () => {
  beforeEach(() => {
    dbCircuitBreaker.reset();
    vi.useRealTimers();
  });

  it('opens after N+1 transient failures and fails fast', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        dbCircuitBreaker.execute(
          async () => {
            throw new Error('connection reset by peer');
          },
          { shouldCountFailure: () => true }
        )
      ).rejects.toThrow('connection reset by peer');
    }

    await expect(
      dbCircuitBreaker.execute(async () => 'nope', {
        shouldCountFailure: () => true,
      })
    ).rejects.toBeInstanceOf(DbCircuitOpenError);
  });

  it('closes after successful half-open request', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      await expect(
        dbCircuitBreaker.execute(
          async () => {
            throw new Error('timeout');
          },
          { shouldCountFailure: () => true }
        )
      ).rejects.toThrow('timeout');
    }

    await expect(
      dbCircuitBreaker.execute(async () => 'blocked', {
        shouldCountFailure: () => true,
      })
    ).rejects.toBeInstanceOf(DbCircuitOpenError);

    vi.advanceTimersByTime(10_001);

    await expect(
      dbCircuitBreaker.execute(async () => 'ok', {
        shouldCountFailure: () => true,
      })
    ).resolves.toBe('ok');

    await expect(
      dbCircuitBreaker.execute(async () => 'still-open?', {
        shouldCountFailure: () => true,
      })
    ).resolves.toBe('still-open?');
  });

  it('does not trip when failures are marked non-transient', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(
        dbCircuitBreaker.execute(
          async () => {
            throw new Error('syntax error in SQL');
          },
          { shouldCountFailure: () => false }
        )
      ).rejects.toThrow('syntax error in SQL');
    }

    await expect(
      dbCircuitBreaker.execute(async () => 'healthy', {
        shouldCountFailure: () => false,
      })
    ).resolves.toBe('healthy');
  });
});

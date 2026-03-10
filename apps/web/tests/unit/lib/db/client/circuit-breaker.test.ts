import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
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

  it('closes from HALF_OPEN when probe fails with non-transient error', async () => {
    vi.useFakeTimers();

    // Trip the breaker to OPEN
    for (let i = 0; i < 5; i++) {
      await expect(
        dbCircuitBreaker.execute(
          async () => {
            throw new Error('connection reset');
          },
          { shouldCountFailure: () => true }
        )
      ).rejects.toThrow('connection reset');
    }

    // Confirm it's OPEN
    await expect(
      dbCircuitBreaker.execute(async () => 'blocked', {
        shouldCountFailure: () => true,
      })
    ).rejects.toBeInstanceOf(DbCircuitOpenError);

    // Advance past resetTimeout to transition to HALF_OPEN
    vi.advanceTimersByTime(10_001);

    // Non-transient probe failure in HALF_OPEN should close the breaker
    await expect(
      dbCircuitBreaker.execute(
        async () => {
          throw new Error('syntax error in SQL');
        },
        { shouldCountFailure: () => false }
      )
    ).rejects.toThrow('syntax error in SQL');

    // Breaker should now be CLOSED (not stuck in HALF_OPEN)
    expect(dbCircuitBreaker.getStats().state).toBe('CLOSED');

    // Normal operations should work without throttling
    await expect(
      dbCircuitBreaker.execute(async () => 'healthy', {
        shouldCountFailure: () => true,
      })
    ).resolves.toBe('healthy');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  getClient: vi.fn(() => undefined),
}));

vi.mock('@sentry/nextjs', () => sentry);

describe('CircuitBreaker alert context', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('includes provider name when opening from CLOSED', async () => {
    const { CircuitBreaker } = await import('@/lib/spotify/circuit-breaker');

    const breaker = new CircuitBreaker({
      name: 'test_provider',
      failureThreshold: 1,
      minimumRequestCount: 1,
      failureWindow: 1_000,
      resetTimeout: 1_000,
      successThreshold: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      '[test_provider] Circuit breaker opened (CLOSED -> OPEN)',
      expect.objectContaining({ level: 'warning' })
    );

    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[test_provider] State transition: CLOSED -> OPEN',
      })
    );
  });

  it('opens without a Sentry alert when notify is false, and only once while it stays open', async () => {
    const { CircuitBreaker } = await import('@/lib/spotify/circuit-breaker');
    const breaker = new CircuitBreaker({ name: 'musicfetch' });

    breaker.forceOpen({ notify: false });
    breaker.forceOpen({ notify: false });

    expect(breaker.getState()).toBe('OPEN');
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
  });
});

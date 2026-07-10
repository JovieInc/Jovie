import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: getRedisMock }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('server-only', () => ({}));

import {
  resetSecondaryStorageMemoryForTests,
  secondaryStorage,
} from '@/lib/auth/secondary-storage';

describe('secondaryStorage.increment', () => {
  beforeEach(() => {
    resetSecondaryStorageMemoryForTests();
    getRedisMock.mockReset();
  });

  afterEach(() => {
    delete process.env.AUTH_SECONDARY_STORAGE_TIMEOUT_MS;
  });

  it('always applies TTL with NX so TTL-less counters self-heal', async () => {
    // Regression: a rate-limit key whose first expire call failed kept
    // count>1 with TTL=-1 forever -> permanent 429 for that IP+path bucket
    // (observed live: counts 14/17 with ttl -1 on shared dev Redis).
    const expire = vi.fn().mockResolvedValue(1);
    getRedisMock.mockReturnValue({
      incr: vi.fn().mockResolvedValue(14),
      expire,
    });

    const count = await secondaryStorage.increment?.('ip|/send-otp', 60);

    expect(count).toBe(14);
    expect(expire).toHaveBeenCalledWith('ip|/send-otp', 60, 'NX');
  });

  it('applies NX TTL on first increment too', async () => {
    const expire = vi.fn().mockResolvedValue(1);
    getRedisMock.mockReturnValue({
      incr: vi.fn().mockResolvedValue(1),
      expire,
    });

    await secondaryStorage.increment?.('ip|/send-otp', 60);

    expect(expire).toHaveBeenCalledWith('ip|/send-otp', 60, 'NX');
  });

  it('skips TTL when rule has no window', async () => {
    const expire = vi.fn().mockResolvedValue(1);
    getRedisMock.mockReturnValue({
      incr: vi.fn().mockResolvedValue(2),
      expire,
    });

    await secondaryStorage.increment?.('key', 0);

    expect(expire).not.toHaveBeenCalled();
  });

  it('honors AUTH_SECONDARY_STORAGE_TIMEOUT_MS for slow ops', async () => {
    process.env.AUTH_SECONDARY_STORAGE_TIMEOUT_MS = '1500';
    const slowIncr = vi
      .fn()
      .mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(3), 900))
      );
    getRedisMock.mockReturnValue({
      incr: slowIncr,
      expire: vi.fn().mockResolvedValue(1),
    });

    // 900ms would exceed the 500ms default and degrade to 1; with the env
    // raised to 1500ms the real count survives.
    const count = await secondaryStorage.increment?.('key', 60);
    expect(count).toBe(3);
  });
});

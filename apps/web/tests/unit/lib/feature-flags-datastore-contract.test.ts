import { describe, expect, it, vi } from 'vitest';

const { getRedisMock } = vi.hoisted(() => ({
  getRedisMock: vi.fn(() => null),
}));

vi.mock('@/lib/redis', () => ({ getRedis: getRedisMock }));

vi.mock('@/lib/env-server', () => ({
  env: { STATSIG_SERVER_SECRET: 'secret-test-key', VERCEL_ENV: 'test' },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_E2E_MODE: undefined },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Statsig specs data store SDK contract', () => {
  it('exposes the initialize method the statsig-node-core DataStore adapter requires to start', async () => {
    // statsig-node-core@0.24.2's Rust specs adapter refuses to start unless
    // the DataStore exposes an `initialize()` function ("DataStore Error: No
    // 'initialize' function provided"). Without it the Redis spec store is
    // silently skipped and every cold-start init waits on the network
    // (JOV-10537).
    getRedisMock.mockReturnValue({} as never);
    const { createSpecsDataStore } = await import('@/lib/flags/statsig');

    const store = createSpecsDataStore();

    expect(store).toBeDefined();
    expect(typeof store?.initialize).toBe('function');
    await expect(store?.initialize?.()).resolves.toBeUndefined();
    expect(typeof store?.get).toBe('function');
    expect(typeof store?.set).toBe('function');
    expect(typeof store?.supportPollingUpdatesFor).toBe('function');
  });

  it('returns undefined when Redis is not configured', async () => {
    getRedisMock.mockReturnValue(null);
    const { createSpecsDataStore } = await import('@/lib/flags/statsig');

    expect(createSpecsDataStore()).toBeUndefined();
  });
});

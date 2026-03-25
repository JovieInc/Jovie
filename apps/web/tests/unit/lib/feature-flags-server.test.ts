import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock statsig-node before importing the module under test
vi.mock('statsig-node', () => ({
  default: {
    initialize: vi.fn(),
    getFeatureGateSync: vi.fn(() => ({
      value: false,
      evaluationDetails: { reason: 'Unrecognized' },
    })),
  },
}));

// Mock env to control STATSIG_SERVER_SECRET
vi.mock('@/lib/env-server', () => ({
  env: {
    STATSIG_SERVER_SECRET: undefined,
    VERCEL_ENV: undefined,
    NODE_ENV: 'test',
  },
}));

describe('Statsig server initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('warns only once when server secret is missing across multiple checkGate calls', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { checkGate } = await import('@/lib/feature-flags/server');

    // Call checkGate multiple times — each internally calls initializeStatsig()
    await checkGate('user-1', 'subscribe_cta_experiment' as any);
    await checkGate('user-2', 'subscribe_cta_experiment' as any);
    await checkGate('user-3', 'subscribe_cta_experiment' as any);

    const statsigWarnings = warnSpy.mock.calls.filter(
      args =>
        typeof args[0] === 'string' &&
        args[0].includes('[Statsig] Server secret not configured')
    );

    expect(statsigWarnings).toHaveLength(1);
  });
});

describe('Statsig dev mode bypass', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('getFeatureFlagsBootstrap returns empty gates in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { getFeatureFlagsBootstrap } = await import(
      '@/lib/feature-flags/server'
    );

    const result = await getFeatureFlagsBootstrap('user-123');
    expect(result).toEqual({ gates: {} });

    vi.unstubAllEnvs();
  });

  it('checkGate returns defaultValue in development without calling Statsig', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const Statsig = await import('statsig-node');
    const { checkGate } = await import('@/lib/feature-flags/server');

    const result = await checkGate(
      'user-123',
      'feature_profile_v2' as any,
      false
    );
    expect(result).toBe(false);

    // Statsig should never be called in dev
    expect(Statsig.default.initialize).not.toHaveBeenCalled();
    expect(Statsig.default.getFeatureGateSync).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('getExperiment returns empty object in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { getExperiment } = await import('@/lib/feature-flags/server');

    const result = await getExperiment('user-123', 'experiment_key');
    expect(result).toEqual({});

    vi.unstubAllEnvs();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STATSIG_GATE_KEYS } from '@/lib/feature-flags/shared';

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
    const { logger } = await import('@/lib/utils/logger');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const { checkGate } = await import('@/lib/feature-flags/server');

    // Call checkGate multiple times — each internally calls initializeStatsig()
    await checkGate('user-1', STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT);
    await checkGate('user-2', STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT);
    await checkGate('user-3', STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT);

    const statsigWarnings = warnSpy.mock.calls.filter(
      args =>
        typeof args[0] === 'string' &&
        args[0].includes('[Statsig] Server secret not configured')
    );

    expect(statsigWarnings).toHaveLength(1);
  });
});

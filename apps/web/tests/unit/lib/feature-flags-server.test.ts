import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_STATSIG_GATE_KEYS } from '@/lib/flags/contracts';

const { getExperimentMock, getFeatureGateMock, initializeMock, shutdownMock } =
  vi.hoisted(() => ({
    getExperimentMock: vi.fn(() => ({ value: {} })),
    getFeatureGateMock: vi.fn(() => ({
      getEvaluationDetails: () => ({ reason: 'Unrecognized' }),
      value: false,
    })),
    initializeMock: vi.fn().mockResolvedValue({ success: true }),
    shutdownMock: vi.fn().mockResolvedValue({ success: true }),
  }));

// Mock the Statsig Core server SDK before importing the module under test.
vi.mock('@statsig/statsig-node-core', () => ({
  Statsig: vi.fn().mockImplementation(() => ({
    getExperiment: getExperimentMock,
    getFeatureGate: getFeatureGateMock,
    initialize: initializeMock,
    shutdown: shutdownMock,
  })),
  StatsigUser: {
    withUserID: (userID: string) => ({ userID }),
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

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_E2E_MODE: undefined,
  },
}));

describe('Statsig server initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
  });

  it('warns only once when server secret is missing across multiple checkGate calls', async () => {
    const { logger } = await import('@/lib/utils/logger');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const { checkGateForUser } = await import('@/lib/flags/server');

    // Call checkGate multiple times — each internally calls initializeStatsig()
    await checkGateForUser(
      'user-1',
      LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT
    );
    await checkGateForUser(
      'user-2',
      LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT
    );
    await checkGateForUser(
      'user-3',
      LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT
    );

    const statsigWarnings = warnSpy.mock.calls.filter(
      args =>
        typeof args[0] === 'string' &&
        args[0].includes('[Statsig] Server secret not configured')
    );

    expect(statsigWarnings).toHaveLength(1);
  });

  it('ignores client override cookies in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';

    vi.doMock('next/headers', () => ({
      cookies: async () => ({
        get: (name: string) =>
          name === 'jovie_app_flag_overrides'
            ? {
                value: encodeURIComponent(
                  JSON.stringify({ 'code:THREADS_ENABLED': true })
                ),
              }
            : undefined,
      }),
    }));

    vi.doMock('flags/next', () => ({
      dedupe: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    }));

    const run = vi.fn().mockResolvedValue(false);
    vi.doMock('@/lib/flags/registry', () => ({
      APP_FLAG_REGISTRY: {
        THREADS_ENABLED: { run },
      },
      SUBSCRIBE_CTA_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('two_step'),
      },
      PROFILE_ALERT_OPTIN_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('button'),
      },
    }));

    const { getAppFlagValue } = await import('@/lib/flags/server');
    await expect(getAppFlagValue('THREADS_ENABLED')).resolves.toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

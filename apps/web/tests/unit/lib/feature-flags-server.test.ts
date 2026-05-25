import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_STATSIG_GATE_KEYS } from '@/lib/flags/contracts';

const {
  envState,
  getExperimentMock,
  getFeatureGateMock,
  initializeMock,
  shutdownMock,
  statsigConstructorMock,
} = vi.hoisted(() => {
  const getExperimentMock = vi.fn(() => ({ value: {} }));
  const getFeatureGateMock = vi.fn(() => ({
    getEvaluationDetails: () => ({ reason: 'Unrecognized' }),
    value: false,
  }));
  const initializeMock = vi.fn().mockResolvedValue({ success: true });
  const shutdownMock = vi.fn().mockResolvedValue({ success: true });

  return {
    envState: {
      STATSIG_SERVER_SECRET: undefined as string | undefined,
      VERCEL_ENV: undefined as string | undefined,
      NODE_ENV: 'test',
    },
    getExperimentMock,
    getFeatureGateMock,
    initializeMock,
    shutdownMock,
    statsigConstructorMock: vi.fn(function StatsigMock() {
      return {
        getExperiment: getExperimentMock,
        getFeatureGate: getFeatureGateMock,
        initialize: initializeMock,
        shutdown: shutdownMock,
      };
    }),
  };
});

const { mockIsAdmin } = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
}));

const { mockCookiesGet, mockCookies } = vi.hoisted(() => {
  const mockCookiesGet = vi.fn();
  return {
    mockCookiesGet,
    mockCookies: vi.fn(async () => ({
      get: mockCookiesGet,
    })),
  };
});

// Mock the Statsig Core server SDK before importing the module under test.
vi.mock('@statsig/statsig-node-core', () => ({
  Statsig: statsigConstructorMock,
  StatsigUser: {
    withUserID: (userID: string) => ({ userID }),
  },
}));

// Mock env to control STATSIG_SERVER_SECRET
vi.mock('@/lib/env-server', () => ({
  env: envState,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_E2E_MODE: undefined,
  },
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

describe('Statsig server initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    envState.STATSIG_SERVER_SECRET = undefined;
    envState.VERCEL_ENV = undefined;
    envState.NODE_ENV = 'test';
    getExperimentMock.mockReturnValue({ value: {} });
    getFeatureGateMock.mockReturnValue({
      getEvaluationDetails: () => ({ reason: 'Unrecognized' }),
      value: false,
    });
    mockCookiesGet.mockReset().mockReturnValue(undefined);
    mockIsAdmin.mockReset().mockResolvedValue(false);
    initializeMock.mockReset().mockResolvedValue({ success: true });
    shutdownMock.mockReset().mockResolvedValue({ success: true });
    statsigConstructorMock.mockClear();
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

  it('creates a fresh Statsig client after initialization fails', async () => {
    envState.STATSIG_SERVER_SECRET = 'secret-server-key';
    initializeMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ success: true });

    const { checkGateForUser } = await import('@/lib/flags/statsig');

    await expect(
      checkGateForUser('user-1', LEGACY_STATSIG_GATE_KEYS.DESIGN_V1, true)
    ).resolves.toBe(true);
    await expect(
      checkGateForUser('user-2', LEGACY_STATSIG_GATE_KEYS.DESIGN_V1, true)
    ).resolves.toBe(true);

    expect(statsigConstructorMock).toHaveBeenCalledTimes(2);
    expect(initializeMock).toHaveBeenCalledTimes(2);
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(shutdownMock).toHaveBeenCalledWith();
  });

  it('falls back when Statsig initialization times out', async () => {
    vi.useFakeTimers();

    try {
      envState.STATSIG_SERVER_SECRET = 'secret-server-key';
      initializeMock.mockReturnValueOnce(new Promise(() => {}));

      const { logger } = await import('@/lib/utils/logger');
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const { checkGateForUser } = await import('@/lib/flags/statsig');

      const result = checkGateForUser(
        'user-1',
        LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
        true
      );

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(result).resolves.toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        '[Statsig] Failed to initialize server SDK',
        expect.objectContaining({
          message: 'Statsig initialization timed out after 10000ms',
        }),
        'Statsig'
      );
      expect(statsigConstructorMock).toHaveBeenCalledTimes(1);
      expect(initializeMock).toHaveBeenCalledTimes(1);
      expect(shutdownMock).toHaveBeenCalledTimes(1);
      expect(shutdownMock).toHaveBeenCalledWith();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds explicit shutdown and resets the Statsig singleton', async () => {
    vi.useFakeTimers();

    try {
      envState.STATSIG_SERVER_SECRET = 'secret-server-key';
      getFeatureGateMock.mockReturnValue({
        getEvaluationDetails: () => ({ reason: 'Network' }),
        value: true,
      });

      const { checkGateForUser, shutdownStatsig } = await import(
        '@/lib/flags/statsig'
      );

      await expect(
        checkGateForUser('user-1', LEGACY_STATSIG_GATE_KEYS.DESIGN_V1, false)
      ).resolves.toBe(true);

      shutdownMock.mockReturnValueOnce(new Promise(() => {}));

      const shutdownResult = shutdownStatsig().catch(error => error);
      await vi.advanceTimersByTimeAsync(1500);

      await expect(shutdownResult).resolves.toEqual(
        expect.objectContaining({
          message: 'Statsig shutdown timed out after 1500ms',
        })
      );
      expect(shutdownMock).toHaveBeenCalledWith();

      await expect(
        checkGateForUser('user-2', LEGACY_STATSIG_GATE_KEYS.DESIGN_V1, false)
      ).resolves.toBe(true);
      expect(statsigConstructorMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores client override cookies in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    mockCookiesGet.mockImplementation((name: string) =>
      name === 'jovie_app_flag_overrides'
        ? {
            value: encodeURIComponent(
              JSON.stringify({ 'code:SPOTIFY_OAUTH': true })
            ),
          }
        : undefined
    );

    vi.doMock('flags/next', () => ({
      dedupe: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    }));

    const run = vi.fn().mockResolvedValue(false);
    vi.doMock('@/lib/flags/registry', () => ({
      APP_FLAG_REGISTRY: {
        SPOTIFY_OAUTH: { run },
      },
      SUBSCRIBE_CTA_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('two_step'),
      },
      PROFILE_ALERT_OPTIN_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('button'),
      },
    }));

    const { getAppFlagValue } = await import('@/lib/flags/server');
    await expect(getAppFlagValue('SPOTIFY_OAUTH')).resolves.toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns true for admin users before consulting the registry', async () => {
    mockIsAdmin.mockResolvedValue(true);

    vi.doMock('flags/next', () => ({
      dedupe: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    }));

    const run = vi.fn().mockResolvedValue(false);
    vi.doMock('@/lib/flags/registry', () => ({
      APP_FLAG_REGISTRY: {
        SPOTIFY_OAUTH: { run },
      },
      SUBSCRIBE_CTA_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('two_step'),
      },
      PROFILE_ALERT_OPTIN_VARIANT_FLAG: {
        run: vi.fn().mockResolvedValue('button'),
      },
    }));

    const { getAppFlagValue } = await import('@/lib/flags/server');
    await expect(
      getAppFlagValue('SPOTIFY_OAUTH', { userId: 'admin_123' })
    ).resolves.toBe(true);
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_123');
    expect(run).not.toHaveBeenCalled();
  });
});

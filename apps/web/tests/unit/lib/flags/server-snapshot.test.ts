import { beforeEach, describe, expect, it, vi } from 'vitest';

const registryRunMock = vi.fn();

vi.mock('flags/next', () => ({
  dedupe: (fn: () => Promise<unknown>) => fn,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: () => undefined,
  }),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/flags/registry', () => ({
  APP_FLAG_REGISTRY: {
    DESIGN_V1: {
      run: (...args: unknown[]) => registryRunMock('DESIGN_V1', ...args),
    },
    STRIPE_CONNECT_ENABLED: {
      run: (...args: unknown[]) =>
        registryRunMock('STRIPE_CONNECT_ENABLED', ...args),
    },
    MERCH_MVP: {
      run: (...args: unknown[]) => registryRunMock('MERCH_MVP', ...args),
    },
  },
  PROFILE_ALERT_OPTIN_VARIANT_FLAG: { run: vi.fn() },
  SUBSCRIBE_CTA_VARIANT_FLAG: { run: vi.fn() },
}));

describe('getAppFlagsSnapshot flagNames option', () => {
  beforeEach(() => {
    registryRunMock.mockReset();
    registryRunMock.mockImplementation(async (flagName: string) => {
      if (flagName === 'DESIGN_V1') return true;
      if (flagName === 'STRIPE_CONNECT_ENABLED') return false;
      return true;
    });
  });

  it('resolves only the requested flags', async () => {
    const { getAppFlagsSnapshot } = await import('@/lib/flags/server');

    const snapshot = await getAppFlagsSnapshot({
      userId: 'user_123',
      flagNames: ['DESIGN_V1', 'STRIPE_CONNECT_ENABLED'],
    });

    const resolvedFlagNames = registryRunMock.mock.calls.map(call => call[0]);
    expect(resolvedFlagNames).toEqual(
      expect.arrayContaining(['DESIGN_V1', 'STRIPE_CONNECT_ENABLED'])
    );
    expect(resolvedFlagNames).not.toContain('MERCH_MVP');
    expect(snapshot).toEqual({
      DESIGN_V1: true,
      STRIPE_CONNECT_ENABLED: false,
    });
    expect(Object.keys(snapshot)).toHaveLength(2);
  });
});

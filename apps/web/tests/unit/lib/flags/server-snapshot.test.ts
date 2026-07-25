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
    STRIPE_CONNECT_ENABLED: {
      run: (...args: unknown[]) =>
        registryRunMock('STRIPE_CONNECT_ENABLED', ...args),
    },
    MERCH_MVP: {
      run: (...args: unknown[]) => registryRunMock('MERCH_MVP', ...args),
    },
    APPLE_WALLET_PROFILE_PASS: {
      run: (...args: unknown[]) =>
        registryRunMock('APPLE_WALLET_PROFILE_PASS', ...args),
    },
  },
  PROFILE_ALERT_OPTIN_VARIANT_FLAG: { run: vi.fn() },
  SUBSCRIBE_CTA_VARIANT_FLAG: { run: vi.fn() },
}));

describe('getAppFlagsSnapshot flagNames option', () => {
  beforeEach(() => {
    registryRunMock.mockReset();
    registryRunMock.mockImplementation(async (flagName: string) => {
      if (flagName === 'STRIPE_CONNECT_ENABLED') return false;
      return true;
    });
  });

  it('resolves only the requested flags', async () => {
    const { getAppFlagsSnapshot } = await import('@/lib/flags/server');

    const snapshot = await getAppFlagsSnapshot({
      userId: 'user_123',
      flagNames: ['MERCH_MVP', 'STRIPE_CONNECT_ENABLED'],
    });

    const resolvedFlagNames = registryRunMock.mock.calls.map(call => call[0]);
    expect(resolvedFlagNames).toEqual(
      expect.arrayContaining(['MERCH_MVP', 'STRIPE_CONNECT_ENABLED'])
    );
    expect(resolvedFlagNames).not.toContain('APPLE_WALLET_PROFILE_PASS');
    expect(snapshot).toEqual({
      MERCH_MVP: true,
      STRIPE_CONNECT_ENABLED: false,
    });
    expect(Object.keys(snapshot)).toHaveLength(2);
  });
});

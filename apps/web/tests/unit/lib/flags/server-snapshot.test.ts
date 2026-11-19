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
    PLAYLIST_ENGINE: {
      run: (...args: unknown[]) => registryRunMock('PLAYLIST_ENGINE', ...args),
    },
    MERCH_MVP: {
      run: (...args: unknown[]) => registryRunMock('MERCH_MVP', ...args),
    },
    TELEPROMPTER_RECORDING: {
      run: (...args: unknown[]) =>
        registryRunMock('TELEPROMPTER_RECORDING', ...args),
    },
  },
  PROFILE_ALERT_OPTIN_VARIANT_FLAG: { run: vi.fn() },
  SUBSCRIBE_CTA_VARIANT_FLAG: { run: vi.fn() },
}));

describe('getAppFlagsSnapshot flagNames option', () => {
  beforeEach(() => {
    registryRunMock.mockReset();
    registryRunMock.mockImplementation(async (flagName: string) => {
      if (flagName === 'PLAYLIST_ENGINE') return false;
      return true;
    });
  });

  it('resolves only the requested flags', async () => {
    const { getAppFlagsSnapshot } = await import('@/lib/flags/server');

    const snapshot = await getAppFlagsSnapshot({
      userId: 'user_123',
      flagNames: ['MERCH_MVP', 'PLAYLIST_ENGINE'],
    });

    const resolvedFlagNames = registryRunMock.mock.calls.map(call => call[0]);
    expect(resolvedFlagNames).toEqual(
      expect.arrayContaining(['MERCH_MVP', 'PLAYLIST_ENGINE'])
    );
    expect(resolvedFlagNames).not.toContain('TELEPROMPTER_RECORDING');
    expect(snapshot).toEqual({
      MERCH_MVP: true,
      PLAYLIST_ENGINE: false,
    });
    expect(Object.keys(snapshot)).toHaveLength(2);
  });
});

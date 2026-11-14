import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_KEYS,
  LOCAL_DEFAULT_ONLY_FLAGS,
} from '@/lib/flags/contracts';
import { getAppFlagValue } from '@/lib/flags/server';

const mocks = vi.hoisted(() => ({ overrides: vi.fn(), admin: vi.fn() }));
vi.mock('flags/next', () => ({
  dedupe: (fn: unknown) => fn,
  getProviderData: () => ({}),
  flag: (config: { defaultValue: unknown }) => ({
    run: async () => config.defaultValue,
  }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.admin }));
vi.mock('@/lib/flags/overrides-store.server', () => ({
  getFlagOverrideMap: mocks.overrides,
}));

beforeEach(() => {
  mocks.overrides.mockReset().mockResolvedValue({});
  mocks.admin.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('outbound dogfood rollout', () => {
  it('registers a production-off local flag', () => {
    expect(APP_FLAG_DEFAULTS.OUTBOUND_DOGFOOD_GATE).toBe(false);
    expect(APP_FLAG_KEYS.OUTBOUND_DOGFOOD_GATE).toBe('outbound_dogfood_gate');
    expect(LOCAL_DEFAULT_ONLY_FLAGS.has('OUTBOUND_DOGFOOD_GATE')).toBe(true);
  });

  it.each(['test', 'development', 'production'])(
    'defaults on only in tests, including admins (%s)',
    async runtime => {
      vi.stubEnv('NODE_ENV', runtime);
      vi.stubEnv('VERCEL_ENV', 'production');
      for (const userId of [null, 'admin']) {
        expect(await getAppFlagValue('OUTBOUND_DOGFOOD_GATE', { userId })).toBe(
          runtime === 'test'
        );
      }
    }
  );

  it('keeps gating enabled when the override cache rejects in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.overrides.mockRejectedValue(new Error('cache unavailable'));
    expect(await getAppFlagValue('OUTBOUND_DOGFOOD_GATE')).toBe(true);
  });

  it.each([false, true])('honors an explicit %s override', async enabled => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.overrides.mockResolvedValue({ OUTBOUND_DOGFOOD_GATE: enabled });
    expect(await getAppFlagValue('OUTBOUND_DOGFOOD_GATE')).toBe(enabled);
  });
});

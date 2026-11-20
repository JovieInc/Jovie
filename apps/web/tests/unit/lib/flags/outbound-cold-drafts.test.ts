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

describe('cold draft rollout', () => {
  it('registers a production-off local flag', () => {
    expect(APP_FLAG_DEFAULTS.OUTBOUND_COLD_DRAFTS).toBe(false);
    expect(APP_FLAG_KEYS.OUTBOUND_COLD_DRAFTS).toBe('outbound_cold_drafts');
    expect(LOCAL_DEFAULT_ONLY_FLAGS.has('OUTBOUND_COLD_DRAFTS')).toBe(true);
  });

  it.each(['test', 'development', 'production'])(
    'defaults off in every runtime, including admins (%s)',
    async runtime => {
      vi.stubEnv('NODE_ENV', runtime);
      vi.stubEnv('VERCEL_ENV', 'production');
      for (const userId of [null, 'admin']) {
        expect(await getAppFlagValue('OUTBOUND_COLD_DRAFTS', { userId })).toBe(
          false
        );
      }
    }
  );

  it('keeps composition disabled when the override cache rejects in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.overrides.mockRejectedValue(new Error('cache unavailable'));
    expect(await getAppFlagValue('OUTBOUND_COLD_DRAFTS')).toBe(false);
  });

  it.each([false, true])('honors an explicit %s override', async enabled => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.overrides.mockResolvedValue({ OUTBOUND_COLD_DRAFTS: enabled });
    expect(await getAppFlagValue('OUTBOUND_COLD_DRAFTS')).toBe(enabled);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFlags() {
  vi.resetModules();
  return await import('@/lib/flags/marketing-static');
}

describe('marketing static flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides marketing center navigation in production by default', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_CENTER_NAV', '');
    vi.stubEnv('NEXT_PUBLIC_SHOW_HOMEPAGE_CENTER_NAV', '');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(false);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(false);
  });

  it('can enable marketing center navigation with the shared public flag', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_CENTER_NAV', 'true');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(true);
  });
});

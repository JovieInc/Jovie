import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFlags() {
  vi.resetModules();
  return await import('@/lib/flags/marketing-static');
}

describe('marketing static flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps every static marketing flag default-on except inverted V1 toggles', async () => {
    const { FEATURE_FLAGS } = await importFlags();

    // *_V1_DESIGN flags use inverted semantics: true = OLD design. Production ships V2.
    const invertedV1DesignFlags = new Set([
      'SHOW_HOME_V1_DESIGN',
      'SHOW_PUBLIC_PROFILE_V1_DESIGN',
    ]);

    const defaultOnFlags = Object.entries(FEATURE_FLAGS)
      .filter(([key]) => !invertedV1DesignFlags.has(key))
      .map(([, value]) => value);

    expect(defaultOnFlags.every(Boolean)).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOME_V1_DESIGN).toBe(false);
    expect(FEATURE_FLAGS.SHOW_PUBLIC_PROFILE_V1_DESIGN).toBe(false);
  });

  it('shows marketing center navigation in production by default', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_CENTER_NAV', '');
    vi.stubEnv('NEXT_PUBLIC_SHOW_HOMEPAGE_CENTER_NAV', '');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(true);
  });

  it('shows marketing center navigation in local builds by default', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_CENTER_NAV', '');
    vi.stubEnv('NEXT_PUBLIC_SHOW_HOMEPAGE_CENTER_NAV', '');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(true);
  });

  it('can enable marketing center navigation with the shared public flag', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_CENTER_NAV', 'true');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(true);
  });

  it('shows the expanded marketing footer by default', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_FULL_FOOTER', '');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER).toBe(true);
  });

  it('can enable the expanded marketing footer with its shared public flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOW_MARKETING_FULL_FOOTER', 'true');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER).toBe(true);
  });

});

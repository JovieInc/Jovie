import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFlags() {
  vi.resetModules();
  return await import('@/lib/flags/marketing-static');
}

describe('marketing static flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps every static marketing flag default-on for internal v1 access', async () => {
    const { FEATURE_FLAGS } = await importFlags();

    expect(Object.values(FEATURE_FLAGS).every(Boolean)).toBe(true);
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

  it('keeps the tightened homepage story visible in production by default', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_HOMEPAGE_UNLOCKED_SECTIONS', '');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS).toBe(true);
  });

  it('keeps the unlocked homepage story visible even when the env flag is false', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SHOW_HOMEPAGE_UNLOCKED_SECTIONS', 'false');

    const { FEATURE_FLAGS } = await importFlags();

    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS).toBe(true);
  });
});

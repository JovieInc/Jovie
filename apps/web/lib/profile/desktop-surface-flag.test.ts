import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFlag() {
  vi.resetModules();
  const { PROFILE_DESKTOP_SURFACE_ENABLED } = await import(
    './desktop-surface-flag'
  );
  return PROFILE_DESKTOP_SURFACE_ENABLED;
}

describe('PROFILE_DESKTOP_SURFACE_ENABLED', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off when the build does not set the flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', undefined);
    expect(await loadFlag()).toBe(false);
  });

  it.each(['0', 'false', 'yes', ''])('stays off for %j', async value => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', value);
    expect(await loadFlag()).toBe(false);
  });

  it.each(['1', 'true'])('turns on for %j', async value => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', value);
    expect(await loadFlag()).toBe(true);
  });
});

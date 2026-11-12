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

  it('is on when the build does not set the flag (canonical desktop surface)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', undefined);
    expect(await loadFlag()).toBe(true);
  });

  it.each(['1', 'true', 'yes'])('stays on for %j', async value => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', value);
    expect(await loadFlag()).toBe(true);
  });

  it.each(['0', 'false', ''])('opts out for %j', async value => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', value);
    expect(await loadFlag()).toBe(false);
  });
});

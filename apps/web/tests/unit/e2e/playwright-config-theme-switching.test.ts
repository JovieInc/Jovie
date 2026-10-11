import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The managed web server always starts with NEXT_PUBLIC_FEATURE_THEME_SWITCHING=1
 * (see webServer.env in playwright.config.ts), but Playwright only forwards
 * that env to the spawned server process, not to this config process or the
 * workers it forks. axe-audit.spec.ts imports isThemeRoute() and runs it in
 * the test process, so without propagation the light-mode axe pass silently
 * skipped every route (Seer 17142845/0).
 */
describe('playwright config theme-switching propagation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadConfig() {
    // The config sets process.env as an import-time side effect, so each
    // scenario needs a fresh module evaluation, not the cached one.
    vi.resetModules();
    await import('../../../playwright.config');
  }

  it('propagates NEXT_PUBLIC_FEATURE_THEME_SWITCHING to the test process when the managed web server is used', async () => {
    delete process.env.CI;
    delete process.env.BASE_URL;
    delete process.env.E2E_SKIP_WEB_SERVER;
    delete process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
    await loadConfig();
    expect(process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING).toBe('1');
  });

  it('leaves the flag as-is when CI supplies BASE_URL for a prebuilt server', async () => {
    process.env.CI = 'true';
    process.env.BASE_URL = 'http://localhost:3220';
    delete process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
    await loadConfig();
    expect(process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING).toBeUndefined();
  });

  it('does not clobber an explicit flag value already set for a prebuilt server', async () => {
    process.env.CI = 'true';
    process.env.BASE_URL = 'http://localhost:3220';
    process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = '1';
    await loadConfig();
    expect(process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING).toBe('1');
  });
});

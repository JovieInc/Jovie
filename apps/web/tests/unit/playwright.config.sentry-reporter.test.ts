import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadConfig() {
  vi.resetModules();
  const playwrightConfigModule = await import('../../playwright.config');
  return playwrightConfigModule.default;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('playwright sentry reporter wiring', { timeout: 15000 }, () => {
  it('includes the sentry reporter when SENTRY_E2E_REPORTING is enabled', async () => {
    process.env.CI = 'true';
    process.env.SENTRY_E2E_REPORTING = '1';
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

    const config = await loadConfig();

    expect(config.reporter).toEqual(
      expect.arrayContaining([['./tests/e2e/reporters/sentry-ci-reporter.ts']])
    );
  });

  it('does not include the sentry reporter when SENTRY_E2E_REPORTING is disabled', async () => {
    process.env.CI = 'true';
    delete process.env.SENTRY_E2E_REPORTING;
    delete process.env.SENTRY_DSN;

    const config = await loadConfig();

    expect(config.reporter).not.toEqual(
      expect.arrayContaining([['./tests/e2e/reporters/sentry-ci-reporter.ts']])
    );
  });

  it('uses html reporter when not in CI', async () => {
    delete process.env.CI;
    delete process.env.SENTRY_E2E_REPORTING;
    delete process.env.SENTRY_DSN;

    const config = await loadConfig();

    expect(config.reporter).toBe('html');
  });
});

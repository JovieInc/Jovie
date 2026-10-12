import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSentryCiDestination } from '../../e2e/reporters/sentry-ci-reporter';

describe('Playwright Sentry isolation', () => {
  it('never sends Playwright failures to the production Sentry DSN', () => {
    expect(
      resolveSentryCiDestination({
        SENTRY_E2E_REPORTING: '1',
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/production',
      })
    ).toBeNull();
  });

  it('routes explicit test reporting to the dev project as synthetic', () => {
    expect(
      resolveSentryCiDestination({
        SENTRY_E2E_REPORTING: '1',
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/production',
        SENTRY_DSN_DEV: 'https://public@example.ingest.sentry.io/development',
        SENTRY_ENVIRONMENT: 'vercel-production',
      })
    ).toEqual({
      dsn: 'https://public@example.ingest.sentry.io/development',
      environment: 'synthetic',
    });
  });

  it('keeps the default CI workflow on Playwright-native failure reporting', () => {
    const workflow = readFileSync(
      new URL('../../../../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );

    expect(workflow).not.toContain('SENTRY_E2E_REPORTING');
    expect(workflow).not.toContain('secrets.SENTRY_DSN');
  });
});

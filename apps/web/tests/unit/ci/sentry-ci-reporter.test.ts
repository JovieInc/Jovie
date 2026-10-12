import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSentryCiDestination } from '../../e2e/reporters/sentry-ci-reporter';

describe('Playwright Sentry isolation', () => {
  const repoRoot = process.cwd().endsWith('/apps/web')
    ? resolve(process.cwd(), '../..')
    : process.cwd();

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
      resolve(repoRoot, '.github/workflows/ci.yml'),
      'utf8'
    );
    const playwrightConfig = readFileSync(
      resolve(repoRoot, 'apps/web/playwright.config.ts'),
      'utf8'
    );
    const sentrySpec = readFileSync(
      resolve(repoRoot, 'apps/web/tests/e2e/sentry.spec.ts'),
      'utf8'
    );

    expect(workflow).not.toContain('SENTRY_E2E_REPORTING');
    expect(workflow).not.toContain('secrets.SENTRY_DSN');
    expect(playwrightConfig).toContain('Boolean(process.env.SENTRY_DSN_DEV)');
    expect(playwrightConfig).not.toContain('Boolean(process.env.SENTRY_DSN)');
    expect(sentrySpec).not.toContain('process.env.SENTRY_DSN ??');
  });
});

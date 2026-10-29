import { describe, expect, it } from 'vitest';

import {
  assertStagingDatabaseIsolation,
  evaluateStagingDbHostGuard,
  isStagingLikeEnvironment,
  normalizeDbHost,
  PROD_DATABASE_HOST_ENV_VAR,
  PROD_DATABASE_HOSTS_ENV_VAR,
  parseDatabaseHost,
} from './db-host-guard';

const STAGING_DB_URL =
  'postgres://user:secret@ep-shared-prod-endpoint-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
const ISOLATED_DB_URL =
  'postgres://user:secret@ep-staging-own-branch-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';

function stagingEnv(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://staging.jov.ie',
    DATABASE_URL: STAGING_DB_URL,
    [PROD_DATABASE_HOST_ENV_VAR]:
      'ep-shared-prod-endpoint-pooler.us-east-2.aws.neon.tech',
    ...overrides,
  };
}

describe('parseDatabaseHost', () => {
  it('parses postgres hosts and never returns credential text', () => {
    expect(parseDatabaseHost(STAGING_DB_URL)).toBe(
      'ep-shared-prod-endpoint.us-east-2.aws.neon.tech'
    );
  });

  it('returns null for missing, malformed, and non-postgres values', () => {
    expect(parseDatabaseHost(undefined)).toBeNull();
    expect(parseDatabaseHost('')).toBeNull();
    expect(parseDatabaseHost('   ')).toBeNull();
    expect(parseDatabaseHost('not a url')).toBeNull();
    expect(parseDatabaseHost('mysql://user:pw@host.example/db')).toBeNull();
    expect(parseDatabaseHost('postgres:// user:pw@host/db')).toBeNull();
  });
});

describe('normalizeDbHost', () => {
  it('collapses neon pooler endpoints and case/trailing-dot drift', () => {
    expect(normalizeDbHost('EP-Host-Pooler.us-east-2.aws.neon.tech.')).toBe(
      'ep-host.us-east-2.aws.neon.tech'
    );
    expect(normalizeDbHost('ep-host.us-east-2.aws.neon.tech')).toBe(
      'ep-host.us-east-2.aws.neon.tech'
    );
  });
});

describe('isStagingLikeEnvironment', () => {
  it('detects preview Vercel env', () => {
    expect(isStagingLikeEnvironment({ VERCEL_ENV: 'preview' })).toBe(true);
  });

  it('detects the staging app url host', () => {
    expect(
      isStagingLikeEnvironment({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://staging.jov.ie',
      })
    ).toBe(true);
  });

  it('detects an explicit JOVIE_ENV staging marker', () => {
    expect(isStagingLikeEnvironment({ JOVIE_ENV: 'staging' })).toBe(true);
  });

  it('ignores production, local dev, and CI smoke boots', () => {
    expect(
      isStagingLikeEnvironment({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://jov.ie',
      })
    ).toBe(false);
    expect(
      isStagingLikeEnvironment({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    ).toBe(false);
    expect(isStagingLikeEnvironment({})).toBe(false);
  });
});

describe('evaluateStagingDbHostGuard', () => {
  it('is inactive outside staging/preview', () => {
    const verdict = evaluateStagingDbHostGuard({
      env: {
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://jov.ie',
        DATABASE_URL: STAGING_DB_URL,
        [PROD_DATABASE_HOST_ENV_VAR]:
          'ep-shared-prod-endpoint-pooler.us-east-2.aws.neon.tech',
      },
    });
    expect(verdict).toEqual({
      active: false,
      checked: false,
      ok: true,
      reason: null,
    });
  });

  it('fails when staging DATABASE_URL host matches the production host', () => {
    const verdict = evaluateStagingDbHostGuard({ env: stagingEnv() });
    expect(verdict.active).toBe(true);
    expect(verdict.checked).toBe(true);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('staging_database_url_matches_production_host');
  });

  it('matches pooler and direct forms of the same endpoint', () => {
    const verdict = evaluateStagingDbHostGuard({
      env: stagingEnv({
        DATABASE_URL: ISOLATED_DB_URL,
        [PROD_DATABASE_HOST_ENV_VAR]:
          'ep-staging-own-branch.us-east-2.aws.neon.tech',
      }),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('staging_database_url_matches_production_host');
  });

  it('passes when staging has its own database host', () => {
    const verdict = evaluateStagingDbHostGuard({
      env: stagingEnv({ DATABASE_URL: ISOLATED_DB_URL }),
    });
    expect(verdict).toEqual({
      active: true,
      checked: true,
      ok: true,
      reason: null,
    });
  });

  it('supports a comma-separated production host list', () => {
    const verdict = evaluateStagingDbHostGuard({
      env: stagingEnv({
        [PROD_DATABASE_HOST_ENV_VAR]: '',
        [PROD_DATABASE_HOSTS_ENV_VAR]:
          'ep-other-branch.us-east-2.aws.neon.tech, ep-shared-prod-endpoint-pooler.us-east-2.aws.neon.tech',
      }),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('staging_database_url_matches_production_host');
  });

  it('reports a missing production reference instead of guessing', () => {
    const env = stagingEnv();
    delete env[PROD_DATABASE_HOST_ENV_VAR];
    const verdict = evaluateStagingDbHostGuard({ env });
    expect(verdict).toEqual({
      active: true,
      checked: false,
      ok: true,
      reason: 'prod_database_host_reference_missing',
    });
  });

  it('skips the comparison when DATABASE_URL is unparsable', () => {
    const verdict = evaluateStagingDbHostGuard({
      env: stagingEnv({ DATABASE_URL: 'garbage' }),
    });
    expect(verdict).toEqual({
      active: true,
      checked: false,
      ok: true,
      reason: 'database_url_unparsable',
    });
  });
});

describe('assertStagingDatabaseIsolation', () => {
  it('does not throw on production', () => {
    expect(() =>
      assertStagingDatabaseIsolation({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_URL: 'https://jov.ie',
        DATABASE_URL: STAGING_DB_URL,
        [PROD_DATABASE_HOST_ENV_VAR]:
          'ep-shared-prod-endpoint-pooler.us-east-2.aws.neon.tech',
      })
    ).not.toThrow();
  });

  it('does not throw when staging is properly isolated', () => {
    expect(() =>
      assertStagingDatabaseIsolation(
        stagingEnv({ DATABASE_URL: ISOLATED_DB_URL })
      )
    ).not.toThrow();
  });

  it('throws loudly on a staging-to-production host collision', () => {
    expect(() => assertStagingDatabaseIsolation(stagingEnv())).toThrow(
      /JOV-9959.*refusing to boot/i
    );
  });

  it('never includes connection-string text in the thrown message', () => {
    let message = '';
    try {
      assertStagingDatabaseIsolation(stagingEnv());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain('postgres://');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('@');
  });
});

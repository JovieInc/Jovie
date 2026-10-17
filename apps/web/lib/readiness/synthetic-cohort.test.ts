import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSignupOnboardingReadiness } from './signup-onboarding';
import {
  checkSyntheticCohortConfiguration,
  describeCohortDatabase,
  type SyntheticCohortBinding,
} from './synthetic-cohort';

const source = 'a'.repeat(40);
const artifact = 'b'.repeat(64);
// Independently calculated SHA256 of Python json.dumps([host, 5432, 'neondb']).
const devFingerprint =
  '49336c9bcfe3562e2cd2217f2a7eedf263b5fc9753ff2bbc1fa969a758553de0';
const prodFingerprint =
  '041b5d96da40b5c9d69d2a62fb34fe42dc59f1c7a2c68bf02b6e8bcdca16d015';
const cohortOrigin = 'https://jovie-cohort-fixture.vercel.app';
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(webRoot, 'scripts/check-synthetic-cohort-readiness.ts');
const temporary: string[] = [];

function binding(): SyntheticCohortBinding {
  return {
    schema: 'jovie.synthetic-cohort-config/v1',
    projectId: 'prj_fixture',
    production: {
      sourceSha: source,
      artifactDigest: artifact,
      databaseFingerprint: prodFingerprint,
      applicationRole: 'neondb_owner',
      origin: 'https://jovie-production-fixture.vercel.app',
    },
    cohort: {
      sourceSha: source,
      artifactDigest: artifact,
      databaseFingerprint: devFingerprint,
      applicationRole: 'neondb_owner',
      origin: cohortOrigin,
    },
    scenario: 'auth',
  };
}

function environment(): Record<string, string> {
  return {
    BETTER_AUTH_URL: cohortOrigin,
    NEXT_PUBLIC_BETTER_AUTH_URL: cohortOrigin,
    NEXT_PUBLIC_APP_URL: cohortOrigin,
    BETTER_AUTH_SECRET: 'fixture-auth-secret-do-not-use-32-characters',
    URL_ENCRYPTION_KEY: 'fixture-url-encryption-key-do-not-use',
    SESSION_SECRET: 'fixture-session-secret-do-not-use',
    DATABASE_URL:
      'postgresql://neondb_owner:fixture-password@ep-dev-pooler.example.test/neondb?sslmode=require', // trufflehog:ignore — inert .example.test parser fixture, no real credential
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'fixture-site-key',
    TURNSTILE_SECRET_KEY: 'fixture-turnstile-secret',
    E2E_PROD_SIGNUP_EMAIL_BASE: 'canary@example.test',
    E2E_PROD_USER_EMAIL: 'canary+synthetic-grokbot-run42@example.test',
    STRIPE_SECRET_KEY: 'sk_test_fixture',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'jovie-cohort-fixture.vercel.app',
    VERCEL_PROJECT_ID: 'prj_fixture',
    VERCEL_GIT_COMMIT_SHA: source,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe('synthetic cohort configuration preflight', () => {
  describe('declared configuration field constraints', () => {
    it.each([
      'BETTER_AUTH_URL',
      'NEXT_PUBLIC_BETTER_AUTH_URL',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
      'SESSION_SECRET',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'NEXT_PUBLIC_APP_URL',
      'E2E_PROD_SIGNUP_EMAIL_BASE',
      'E2E_PROD_USER_EMAIL',
      'STRIPE_SECRET_KEY',
      'VERCEL_ENV',
      'VERCEL_URL',
      'VERCEL_PROJECT_ID',
      'VERCEL_GIT_COMMIT_SHA',
      'URL_ENCRYPTION_KEY',
    ])('independently requires %s', key => {
      const env = environment();
      delete env[key];
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env,
      });
      expect(result.configurationReady).toBe(false);
      expect(result.missing).toContain(key);
      expect(result.issues).toContain('missing_environment');
      expect(result.acceptanceReady).toBe(false);
    });

    it.each([
      'https://branch-fixture.vercel.app',
      'branch-fixture.vercel.app/path',
      '',
      ' ',
      'branch-fixture.vercel.app?query',
      'branch-fixture.vercel.app#fragment',
    ])(
      'rejects a present branch hostname rejected by the canonical schema: %s',
      branch => {
        const result = checkSyntheticCohortConfiguration({
          binding: binding(),
          env: { ...environment(), VERCEL_BRANCH_URL: branch },
        });
        expect(result.configurationReady).toBe(false);
        expect(result.issues).toContain('invalid_platform_branch_host');
        expect(result.acceptanceReady).toBe(false);
      }
    );

    it('preserves the canonical trim and optional-port branch hostname behavior', () => {
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env: {
          ...environment(),
          VERCEL_BRANCH_URL: '  branch-fixture.vercel.app:443  ',
        },
      });
      expect(result.configurationReady).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.acceptanceReady).toBe(false);
    });
  });

  describe('canonical required secret configuration', () => {
    for (const mode of ['preview', 'production']) {
      it.each([
        [
          'auth secret below 32 characters',
          'BETTER_AUTH_SECRET',
          'a'.repeat(31),
          'auth_secret_policy_mismatch',
        ],
        [
          'missing URL encryption key',
          'URL_ENCRYPTION_KEY',
          undefined,
          'url_encryption_key_policy_mismatch',
        ],
        [
          'default URL encryption key',
          'URL_ENCRYPTION_KEY',
          'default-key-change-in-production-32-chars',
          'url_encryption_key_policy_mismatch',
        ],
        [
          'session secret below 32 characters',
          'SESSION_SECRET',
          's'.repeat(31),
          'invalid_session_secret',
        ],
        [
          'restricted Stripe key rejected by runtime',
          'STRIPE_SECRET_KEY',
          'rk_test_fixture',
          'stripe_secret_policy_mismatch',
        ],
      ])(`rejects %s in ${mode}`, (_label, key, value, issue) => {
        const env: Record<string, string | undefined> = {
          ...environment(),
          VERCEL_ENV: mode,
          ...(mode === 'production'
            ? {
                BETTER_AUTH_URL: 'https://jov.ie',
                NEXT_PUBLIC_BETTER_AUTH_URL: 'https://jov.ie',
              }
            : {}),
          [key as string]: value,
        };
        const result = checkSyntheticCohortConfiguration({
          binding: binding(),
          env,
        });
        expect(result.configurationReady).toBe(false);
        expect(result.status).toBe('infrastructure_unavailable');
        expect(result.issues).toContain(issue);
        expect(result.acceptanceReady).toBe(false);
        expect(result.runtimeProofsRequired).toEqual(
          expect.arrayContaining([
            'customer_record_isolation',
            'compiled_application_auth_and_return_origins',
            'test_stripe_account_and_price_identity',
          ])
        );
      });

      it(`accepts the existing 32-character auth and session boundaries in ${mode}`, () => {
        const env = {
          ...environment(),
          VERCEL_ENV: mode,
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          SESSION_SECRET: 's'.repeat(32),
          ...(mode === 'production'
            ? {
                BETTER_AUTH_URL: 'https://jov.ie',
                NEXT_PUBLIC_BETTER_AUTH_URL: 'https://jov.ie',
              }
            : {}),
        };
        const result = checkSyntheticCohortConfiguration({
          binding: binding(),
          env,
        });
        expect(result.configurationReady).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.acceptanceReady).toBe(false);
      });
    }

    it.each([
      [
        'short auth secret',
        'BETTER_AUTH_SECRET',
        'a'.repeat(31),
        'auth_secret_policy_mismatch',
      ],
      [
        'missing URL encryption key',
        'URL_ENCRYPTION_KEY',
        undefined,
        'url_encryption_key_policy_mismatch',
      ],
      [
        'default URL encryption key',
        'URL_ENCRYPTION_KEY',
        'default-key-change-in-production-32-chars',
        'url_encryption_key_policy_mismatch',
      ],
      [
        'short session secret',
        'SESSION_SECRET',
        's'.repeat(31),
        'invalid_session_secret',
      ],
      [
        'restricted Stripe key',
        'STRIPE_SECRET_KEY',
        'rk_test_fixture',
        'stripe_secret_policy_mismatch',
      ],
    ])(
      'real CLI rejects %s without printing secrets',
      (_label, key, value, issue) => {
        const dir = mkdtempSync(
          join(tmpdir(), 'jovie-cohort-secret-regression-')
        );
        temporary.push(dir);
        const file = join(dir, 'binding.json');
        writeFileSync(file, JSON.stringify(binding()));
        const env: Record<string, string | undefined> = {
          ...environment(),
          [key as string]: value,
        };
        const result = spawnSync(
          process.execPath,
          ['--import', 'tsx', cli, `--binding-file=${file}`],
          {
            cwd: webRoot,
            env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env },
            encoding: 'utf8',
            timeout: 15000,
          }
        );
        expect(result.status, result.stderr).toBe(2);
        const report = JSON.parse(result.stdout);
        expect(report).toMatchObject({
          status: 'infrastructure_unavailable',
          configurationReady: false,
          acceptanceReady: false,
        });
        expect(report.issues).toContain(issue);
        expect(report.runtimeProofsRequired).toEqual(
          expect.arrayContaining([
            'customer_record_isolation',
            'non_synthetic_principal_denial',
            'compiled_application_auth_and_return_origins',
          ])
        );
        const output = result.stdout + result.stderr;
        for (const secretKey of [
          'BETTER_AUTH_SECRET',
          'SESSION_SECRET',
          'URL_ENCRYPTION_KEY',
          'STRIPE_SECRET_KEY',
        ]) {
          const secret = env[secretKey];
          if (secret) expect(output).not.toContain(secret);
        }
      }
    );
  });

  describe('deployment origin policy', () => {
    it('rejects cohort auth URLs rejected by the existing production policy', () => {
      const env = { ...environment(), VERCEL_ENV: 'production' };
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env,
      });
      expect(result.configurationReady).toBe(false);
      expect(result.issues).toContain('auth_origin_policy_mismatch');
      expect(result.acceptanceReady).toBe(false);
    });

    it.each([undefined, 'development', 'unsupported'])(
      'rejects an absent or unsupported deployment mode: %s',
      mode => {
        const env = environment();
        if (mode === undefined) delete env.VERCEL_ENV;
        else env.VERCEL_ENV = mode;
        const result = checkSyntheticCohortConfiguration({
          binding: binding(),
          env,
        });
        expect(result.configurationReady).toBe(false);
        expect(result.issues).toContain('unsupported_deployment_environment');
        expect(result.acceptanceReady).toBe(false);
      }
    );

    it('rejects a declared cohort unrelated to the actual platform deployment host', () => {
      const env = {
        ...environment(),
        VERCEL_URL: 'unrelated-fixture.vercel.app',
      };
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env,
      });
      expect(result.configurationReady).toBe(false);
      expect(result.issues).toContain('platform_origin_mismatch');
      expect(result.acceptanceReady).toBe(false);
    });

    it('requires the actual platform deployment host even when configured URLs agree', () => {
      const env = environment();
      delete env.VERCEL_URL;
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env,
      });
      expect(result.configurationReady).toBe(false);
      expect(result.missing).toContain('VERCEL_URL');
      expect(result.issues).toContain('platform_origin_mismatch');
    });

    it('keeps production auth configuration distinct from serving-origin runtime proof', () => {
      const env = {
        ...environment(),
        VERCEL_ENV: 'production',
        BETTER_AUTH_URL: 'https://jov.ie',
        NEXT_PUBLIC_BETTER_AUTH_URL: 'https://jov.ie',
      };
      const result = checkSyntheticCohortConfiguration({
        binding: binding(),
        env,
      });
      expect(result.configurationReady).toBe(true);
      expect(result.acceptanceReady).toBe(false);
      expect(result.runtimeProofsRequired).toEqual(
        expect.arrayContaining([
          'compiled_application_auth_and_return_origins',
          'artifact_target_compatibility',
        ])
      );
    });
  });

  it.each([
    [
      'public app points to production',
      'NEXT_PUBLIC_APP_URL',
      'https://jov.ie',
      'cohort_origin_mismatch',
    ],
    [
      'platform host contains a scheme',
      'VERCEL_URL',
      'https://jovie-cohort-fixture.vercel.app',
      'platform_origin_mismatch',
    ],
    [
      'auth URL contains a path',
      'BETTER_AUTH_URL',
      `${cohortOrigin}/unexpected-path`,
      'auth_origin_policy_mismatch',
    ],
  ])('holds %s', (_label, key, value, issue) => {
    const result = checkSyntheticCohortConfiguration({
      binding: binding(),
      env: { ...environment(), [key]: value },
    });
    expect(result.configurationReady).toBe(false);
    expect(result.acceptanceReady).toBe(false);
    expect(result.issues).toContain(issue);
  });

  it('validates declared configuration without claiming runtime isolation or acceptance', () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network forbidden'));
    const env = environment();
    const result = checkSyntheticCohortConfiguration({
      binding: binding(),
      env,
    });
    expect(result).toMatchObject({
      phase: 'configuration_only',
      status: 'configuration_validated',
      configurationReady: true,
      acceptanceReady: false,
      actorId: 'grokbot',
      stripeMode: 'test',
      issues: [],
    });
    expect(result.runtimeProofsRequired).toEqual(
      expect.arrayContaining([
        'customer_record_isolation',
        'non_synthetic_principal_denial',
        'production_equivalent_schema_and_application_role',
      ])
    );
    expect(fetch).not.toHaveBeenCalled();
    const report = JSON.stringify(result);
    for (const key of [
      'DATABASE_URL',
      'E2E_PROD_USER_EMAIL',
      'E2E_PROD_SIGNUP_EMAIL_BASE',
      'BETTER_AUTH_SECRET',
      'STRIPE_SECRET_KEY',
    ]) {
      expect(report).not.toContain(env[key]);
    }
  });

  it('rejects a shared production target even when ordinary staging signup readiness passes', () => {
    const env = environment();
    env.DATABASE_URL =
      'postgres://neondb_owner:fixture-password@ep-prod-pooler.example.test/neondb?sslmode=require'; // trufflehog:ignore — inert .example.test parser fixture, no real credential
    const ordinary = {
      ...env,
      BETTER_AUTH_URL: 'https://staging.jov.ie',
      NEXT_PUBLIC_BETTER_AUTH_URL: 'https://staging.jov.ie',
    };
    expect(
      checkSignupOnboardingReadiness({
        env: ordinary,
        target: 'stg',
        source: 'env',
      }).ok
    ).toBe(true);
    const declared = binding();
    declared.cohort.databaseFingerprint = prodFingerprint;
    const result = checkSyntheticCohortConfiguration({
      binding: declared,
      env,
    });
    expect(result.status).toBe('infrastructure_unavailable');
    expect(result.issues).toContain('shared_production_database');
    expect(result.acceptanceReady).toBe(false);
  });

  it.each([
    [
      'invalid production origin',
      (b: SyntheticCohortBinding) => {
        b.production.origin = 'https://jov.ie';
      },
      'invalid_production_origin',
    ],
    [
      'different source',
      (b: SyntheticCohortBinding) => {
        b.cohort.sourceSha = 'c'.repeat(40);
      },
      'production_source_mismatch',
    ],
    [
      'rebuilt artifact',
      (b: SyntheticCohortBinding) => {
        b.cohort.artifactDigest = 'c'.repeat(64);
      },
      'production_artifact_mismatch',
    ],
    [
      'wrong expected database',
      (b: SyntheticCohortBinding) => {
        b.cohort.databaseFingerprint = 'c'.repeat(64);
      },
      'database_binding_mismatch',
    ],
    [
      'different connection role',
      (b: SyntheticCohortBinding) => {
        b.cohort.applicationRole = 'other_role';
      },
      'application_role_mismatch',
    ],
    [
      'public production origin',
      (b: SyntheticCohortBinding) => {
        b.cohort.origin = 'https://jov.ie';
      },
      'invalid_immutable_cohort_origin',
    ],
  ] as const)('holds %s', (_label, change, issue) => {
    const declared = binding();
    change(declared);
    const result = checkSyntheticCohortConfiguration({
      binding: declared,
      env: environment(),
    });
    expect(result.status).toBe('infrastructure_unavailable');
    expect(result.issues).toContain(issue);
  });

  it.each([
    ['missing database', 'DATABASE_URL', '', 'missing_environment'],
    [
      'wrong project',
      'VERCEL_PROJECT_ID',
      'prj_other',
      'project_binding_mismatch',
    ],
    [
      'wrong runtime source',
      'VERCEL_GIT_COMMIT_SHA',
      'c'.repeat(40),
      'runtime_source_mismatch',
    ],
    [
      'wrong server origin',
      'BETTER_AUTH_URL',
      'https://jov.ie',
      'auth_origin_policy_mismatch',
    ],
    [
      'customer identity',
      'E2E_PROD_USER_EMAIL',
      'customer@example.test',
      'unapproved_synthetic_principal',
    ],
    [
      'unknown actor',
      'E2E_PROD_USER_EMAIL',
      'canary+synthetic-unknown@example.test',
      'unapproved_synthetic_principal',
    ],
    [
      'uncontrolled mailbox',
      'E2E_PROD_USER_EMAIL',
      'other+synthetic-grokbot@example.test',
      'uncontrolled_synthetic_mailbox',
    ],
    [
      'tagged mailbox base',
      'E2E_PROD_SIGNUP_EMAIL_BASE',
      'canary+tag@example.test',
      'uncontrolled_synthetic_mailbox',
    ],
    ['test OTP override', 'E2E_TEST_MODE', '1', 'test_auth_bypass_enabled'],
    [
      'test session bypass',
      'E2E_USE_TEST_AUTH_BYPASS',
      'true',
      'test_auth_bypass_enabled',
    ],
    [
      'LIVE secret key',
      'STRIPE_SECRET_KEY',
      'sk_live_fixture',
      'stripe_test_key_required',
    ],
    [
      'LIVE public key',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'pk_live_fixture',
      'stripe_test_public_key_required',
    ],
  ])('holds %s', (_label, key, value, issue) => {
    const env = { ...environment(), [key]: value };
    const result = checkSyntheticCohortConfiguration({
      binding: binding(),
      env,
    });
    expect(result.status).toBe('infrastructure_unavailable');
    expect(result.issues).toContain(issue);
  });

  it('checks the existing scenario grant and requires checkout configuration only for checkout', () => {
    const declared = binding();
    declared.scenario = 'checkout_test';
    const env = environment();
    env.E2E_PROD_USER_EMAIL = 'canary+synthetic-instinct@example.test';
    const denied = checkSyntheticCohortConfiguration({
      binding: declared,
      env,
    });
    expect(denied.issues).toEqual(
      expect.arrayContaining([
        'unapproved_synthetic_principal',
        'canonical_test_price_required',
        'webhook_secret_required',
      ])
    );
    env.E2E_PROD_USER_EMAIL = 'canary+synthetic-grokbot@example.test';
    env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY = 'price_fixture';
    env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';
    const configured = checkSyntheticCohortConfiguration({
      binding: declared,
      env,
    });
    expect(configured.configurationReady).toBe(true);
    expect(configured.acceptanceReady).toBe(false);
    expect(configured.runtimeProofsRequired).toContain(
      'signed_test_webhook_and_endpoint_entitlement'
    );
  });

  it('rejects a different production role even when the runtime role matches its declared URL', () => {
    const declared = binding();
    declared.cohort.applicationRole = 'other_role';
    const env = environment();
    env.DATABASE_URL =
      env.DATABASE_URL?.replace('neondb_owner', 'other_role') ?? '';
    const result = checkSyntheticCohortConfiguration({
      binding: declared,
      env,
    });
    expect(result.status).toBe('infrastructure_unavailable');
    expect(result.issues).toContain('production_application_role_mismatch');
  });

  it('rejects the recorded production immutable origin as a cohort origin', () => {
    const declared = binding();
    declared.production.origin = declared.cohort.origin;
    const result = checkSyntheticCohortConfiguration({
      binding: declared,
      env: environment(),
    });
    expect(result.status).toBe('infrastructure_unavailable');
    expect(result.issues).toContain('shared_production_origin');
  });

  it('normalizes direct/pooler identity and refuses connection options that could override the measured target', () => {
    expect(
      describeCohortDatabase(environment().DATABASE_URL)?.fingerprint
    ).toBe(devFingerprint);
    expect(
      describeCohortDatabase(
        'postgres://neondb_owner:fixture@EP-DEV.EXAMPLE.TEST:5432/neondb' // trufflehog:ignore — inert .example.test parser fixture, no real credential
      )?.fingerprint
    ).toBe(devFingerprint);
    for (const value of [
      'not a database URL',
      'https://neondb_owner:fixture@ep-dev.example.test/neondb', // trufflehog:ignore — inert .example.test parser fixture, no real credential
      'postgres://neondb_owner@ep-dev.example.test/neondb',
      'postgres://neondb_owner:fixture@ep-dev.example.test/neondb?host=ep-prod.example.test', // trufflehog:ignore — inert .example.test parser fixture, no real credential
      'postgres://neondb_owner:fixture@ep-dev.example.test/neondb?options=-crole=other_role', // trufflehog:ignore — inert .example.test parser fixture, no real credential
      'postgres://neondb_owner:fixture@ep-dev.example.test/%ZZ', // trufflehog:ignore — inert .example.test parser fixture, no real credential
    ])
      expect(describeCohortDatabase(value)).toBeNull();
  });

  it('classifies absent or malformed bindings as unavailable without exposing supplied values', () => {
    for (const value of [
      null,
      {},
      { schema: 'wrong', token: 'fixture-private-input' },
    ]) {
      const result = checkSyntheticCohortConfiguration({
        binding: value,
        env: {},
      });
      expect(result.status).toBe('infrastructure_unavailable');
      expect(result.issues).toContain('invalid_binding');
      expect(result.acceptanceReady).toBe(false);
      expect(JSON.stringify(result)).not.toContain('fixture-private-input');
    }
  });

  it('runs the real CLI with explicit exit codes and never prints binding or parser input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-cohort-preflight-'));
    temporary.push(dir);
    const file = join(dir, 'binding.json');
    writeFileSync(file, JSON.stringify(binding()));
    const run = (args: string[], env = environment()) =>
      spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
        cwd: webRoot,
        env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env },
        encoding: 'utf8',
        timeout: 15000,
      });
    const configured = run([`--binding-file=${file}`]);
    expect(configured.status, configured.stderr).toBe(0);
    expect(JSON.parse(configured.stdout)).toMatchObject({
      status: 'configuration_validated',
      acceptanceReady: false,
    });
    const wrongProductionOrigin = run([`--binding-file=${file}`], {
      ...environment(),
      VERCEL_ENV: 'production',
    });
    expect(wrongProductionOrigin.status).toBe(2);
    expect(JSON.parse(wrongProductionOrigin.stdout).issues).toContain(
      'auth_origin_policy_mismatch'
    );
    expect(JSON.parse(wrongProductionOrigin.stdout).acceptanceReady).toBe(
      false
    );
    const unavailable = run([`--binding-file=${file}`], {
      ...environment(),
      STRIPE_SECRET_KEY: 'sk_live_fixture',
    });
    expect(unavailable.status).toBe(2);
    expect(JSON.parse(unavailable.stdout).issues).toContain(
      'stripe_test_key_required'
    );
    writeFileSync(file, '{"private":"fixture-private-parser-input",');
    const malformed = run([`--binding-file=${file}`]);
    expect(malformed.status).toBe(2);
    expect(JSON.parse(malformed.stdout).issues).toEqual([
      'binding_input_unavailable',
    ]);
    expect(JSON.parse(malformed.stdout).runtimeProofsRequired).toEqual(
      expect.arrayContaining([
        'customer_record_isolation',
        'non_synthetic_principal_denial',
        'signed_test_webhook_and_endpoint_entitlement',
      ])
    );
    expect(malformed.stdout + malformed.stderr).not.toContain(
      'fixture-private-parser-input'
    );
    const invalidArguments = run(['--unknown=fixture-private-argument']);
    expect(invalidArguments.status).toBe(2);
    expect(JSON.parse(invalidArguments.stdout).runtimeProofsRequired).toContain(
      'customer_record_isolation'
    );
    expect(invalidArguments.stdout + invalidArguments.stderr).not.toContain(
      'fixture-private-argument'
    );
    const unreadable = run([`--binding-file=${join(dir, 'missing.json')}`]);
    expect(unreadable.status).toBe(2);
    expect(JSON.parse(unreadable.stdout)).toMatchObject({
      status: 'infrastructure_unavailable',
      acceptanceReady: false,
      runtimeProofsRequired: expect.arrayContaining([
        'customer_record_isolation',
        'non_synthetic_principal_denial',
      ]),
    });
  });
});

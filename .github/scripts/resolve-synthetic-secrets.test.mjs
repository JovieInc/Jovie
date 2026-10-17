import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatMaskLine,
  resolveSyntheticSecret,
  resolveSyntheticSecrets,
} from './resolve-synthetic-secrets.mjs';

const SCRIPT = new URL('./resolve-synthetic-secrets.mjs', import.meta.url);

test('prefers a non-empty GitHub value over Doppler', () => {
  const resolved = resolveSyntheticSecret({
    name: 'PRODUCTION_WAITLIST_CANARY_READ_TOKEN',
    githubValue: ' github-token ',
    dopplerValue: 'doppler-token',
  });
  assert.equal(resolved.source, 'github');
  assert.equal(resolved.value, 'github-token');
});

test('uses Doppler only when the GitHub value is empty', () => {
  assert.deepEqual(
    resolveSyntheticSecret({
      name: 'E2E_PROD_SIGNUP_EMAIL_BASE',
      githubValue: '   ',
      dopplerValue: ' synthetic@example.com ',
    }),
    {
      name: 'E2E_PROD_SIGNUP_EMAIL_BASE',
      value: 'synthetic@example.com',
      source: 'doppler',
    }
  );
  assert.equal(
    resolveSyntheticSecret({
      name: 'CRON_SECRET',
      githubValue: undefined,
      dopplerValue: '',
    }).source,
    'missing'
  );
});

test('names missing Tim-only OTP secrets and does not treat them as present', () => {
  const result = resolveSyntheticSecrets({
    names: [
      'E2E_PROD_SIGNUP_EMAIL_BASE',
      'E2E_PROD_OTP_CHECK_ORIGIN',
      'E2E_PROD_OTP_CHECK_TOKEN',
      'E2E_PROD_OTP_CHECK_URL',
    ],
    env: { E2E_PROD_SIGNUP_EMAIL_BASE: 'synthetic@example.com' },
    dopplerValues: { E2E_PROD_OTP_CHECK_URL: 'https://otp.example/latest' },
  });
  assert.equal(result.otpAvailable, false);
  assert.match(result.otpSkipReason, /E2E_PROD_OTP_CHECK_ORIGIN/);
  assert.match(result.otpSkipReason, /E2E_PROD_OTP_CHECK_TOKEN/);
  assert.doesNotMatch(result.otpSkipReason, /E2E_PROD_OTP_CHECK_URL/);
  assert.doesNotMatch(result.otpSkipReason, /synthetic@example.com/);
  assert.doesNotMatch(result.otpSkipReason, /otp\.example/);
});

test('does not emit an OTP skip when those names were not requested', () => {
  const result = resolveSyntheticSecrets({
    names: ['CRON_SECRET'],
    env: {},
    dopplerValues: { CRON_SECRET: 'cron-value' },
  });
  assert.equal(result.otpAvailable, true);
  assert.equal(result.otpSkipReason, '');
});

test('mask lines escape workflow command metacharacters', () => {
  assert.equal(formatMaskLine('a%b\nc\rd'), '::add-mask::a%25b%0Ac%0Dd');
});

test('CLI keeps GitHub values, falls back per name, and never logs values', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-resolve-secrets-'));
  try {
    writeFileSync(
      join(root, 'doppler'),
      `#!/bin/sh
name=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "get" ]; then name="$2"; fi
  shift
done
if [ "$name" = "E2E_PROD_SIGNUP_EMAIL_BASE" ]; then
  printf '%s' 'doppler-stderr-secret-do-not-leak' >&2
  exit 1
fi
if [ "$name" = "CRON_SECRET" ]; then
  printf '%s' 'doppler-stderr-secret-do-not-leak' >&2
  printf '%s' 'doppler-cron-value'
  exit 0
fi
printf '%s' 'unexpected-doppler-value' >&2
exit 1
`,
      { mode: 0o755 }
    );
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT.pathname,
        '--name',
        'E2E_PROD_SIGNUP_EMAIL_BASE',
        '--name',
        'CRON_SECRET',
        '--name',
        'E2E_PROD_OTP_CHECK_TOKEN',
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: `${root}:${process.env.PATH}`,
          GITHUB_ACTIONS: 'true',
          GITHUB_ENV: join(root, 'github-env'),
          GITHUB_OUTPUT: join(root, 'github-output'),
          GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
          DOPPLER_TOKEN: 'doppler-token-do-not-leak',
          E2E_PROD_SIGNUP_EMAIL_BASE: 'github-email-base',
          CRON_SECRET: '',
          E2E_PROD_OTP_CHECK_TOKEN: '',
        },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::add-mask::github-email-base/);
    assert.match(result.stdout, /::add-mask::doppler-cron-value/);
    assert.doesNotMatch(result.stderr, /github-email-base/);
    assert.doesNotMatch(result.stderr, /doppler-cron-value/);
    assert.doesNotMatch(result.stderr, /doppler-stderr-secret-do-not-leak/);
    assert.doesNotMatch(result.stderr, /doppler-token-do-not-leak/);
    assert.doesNotMatch(result.stdout, /doppler-token-do-not-leak/);
    assert.match(result.stderr, /E2E_PROD_SIGNUP_EMAIL_BASE source=github/);
    assert.match(result.stderr, /CRON_SECRET source=doppler/);
    assert.match(result.stderr, /E2E_PROD_OTP_CHECK_TOKEN source=missing/);
    assert.match(
      result.stderr,
      /::warning title=Tim-only OTP secrets absent::Skipping OTP-dependent synthetic steps: missing E2E_PROD_OTP_CHECK_TOKEN/
    );

    const exported = readFileSync(join(root, 'github-env'), 'utf8');
    assert.match(exported, /github-email-base/);
    assert.match(exported, /doppler-cron-value/);
    assert.match(exported, /E2E_PROD_OTP_AVAILABLE<<[\s\S]*false/);
    assert.doesNotMatch(exported, /doppler-token-do-not-leak/);
    assert.doesNotMatch(exported, /DATABASE_URL/);

    const summary = readFileSync(join(root, 'summary.md'), 'utf8');
    assert.match(summary, /E2E_PROD_SIGNUP_EMAIL_BASE` \| github/);
    assert.doesNotMatch(summary, /github-email-base/);
    assert.doesNotMatch(summary, /doppler-cron-value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

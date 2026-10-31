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

test('classifies a failed Doppler read as doppler-error, never as missing', () => {
  const resolved = resolveSyntheticSecret({
    name: 'E2E_PROD_OTP_CHECK_TOKEN',
    githubValue: '',
    dopplerValue: { value: '', error: 'exit-7' },
  });
  assert.equal(resolved.source, 'doppler-error');
  assert.equal(resolved.value, '');
  assert.equal(resolved.error, 'exit-7');

  const result = resolveSyntheticSecrets({
    names: ['E2E_PROD_OTP_CHECK_TOKEN', 'E2E_PROD_OTP_CHECK_URL'],
    env: {},
    dopplerValues: {
      E2E_PROD_OTP_CHECK_TOKEN: { value: '', error: 'spawn-ETIMEDOUT' },
      E2E_PROD_OTP_CHECK_URL: { value: '', error: 'spawn-ETIMEDOUT' },
    },
  });
  assert.equal(result.otpAvailable, false);
  assert.match(result.otpSkipReason, /could not read E2E_PROD_OTP_CHECK_TOKEN/);
  assert.match(result.otpSkipReason, /E2E_PROD_OTP_CHECK_URL/);
  assert.match(
    result.otpSkipReason,
    /resolution failure, not a verified missing secret/
  );
  assert.match(result.otpSkipReason, /synthetic-otp-unavailable/);
  assert.doesNotMatch(
    result.otpSkipReason,
    /Skipping OTP-dependent synthetic steps: missing/
  );
});

test('a partial Doppler failure still fails OTP availability and names both shapes', () => {
  const result = resolveSyntheticSecrets({
    names: ['E2E_PROD_OTP_CHECK_TOKEN', 'E2E_PROD_OTP_CHECK_URL'],
    env: {},
    dopplerValues: {
      E2E_PROD_OTP_CHECK_TOKEN: '',
      E2E_PROD_OTP_CHECK_URL: { value: '', error: 'exit-7' },
    },
  });
  assert.equal(result.otpAvailable, false);
  assert.match(result.otpSkipReason, /could not read E2E_PROD_OTP_CHECK_URL/);
  assert.match(result.otpSkipReason, /missing E2E_PROD_OTP_CHECK_TOKEN/);
});

test('a batched Doppler read with values present resolves from doppler', () => {
  const result = resolveSyntheticSecrets({
    names: ['E2E_PROD_OTP_CHECK_TOKEN'],
    env: {},
    dopplerValues: { E2E_PROD_OTP_CHECK_TOKEN: 'otp-token' },
  });
  assert.equal(result.otpAvailable, true);
  assert.equal(result.otpSkipReason, '');
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

function writeFakeDoppler(root, body) {
  writeFileSync(join(root, 'doppler'), `#!/bin/sh\n${body}\n`, {
    mode: 0o755,
  });
}

test('CLI keeps GitHub values, falls back per name, and never logs values', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-resolve-secrets-'));
  try {
    writeFakeDoppler(
      root,
      `if [ "$1 $2" = "secrets download" ]; then
  printf '%s' '{"CRON_SECRET":"doppler-cron-value"}'
  exit 0
fi
printf '%s' 'unexpected-doppler-argv' >&2
exit 1
`
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
    assert.doesNotMatch(result.stderr, /doppler-token-do-not-leak/);
    assert.doesNotMatch(result.stdout, /doppler-token-do-not-leak/);
    assert.match(result.stderr, /E2E_PROD_SIGNUP_EMAIL_BASE source=github/);
    assert.match(result.stderr, /CRON_SECRET source=doppler/);
    assert.match(result.stderr, /E2E_PROD_OTP_CHECK_TOKEN source=missing/);
    assert.doesNotMatch(
      result.stderr,
      /E2E_PROD_OTP_CHECK_TOKEN source=doppler-error/
    );
    assert.match(
      result.stderr,
      /::warning title=Tim-only OTP secrets absent::Skipping OTP-dependent synthetic steps: missing E2E_PROD_OTP_CHECK_TOKEN/
    );
    assert.doesNotMatch(
      result.stderr,
      /::error title=Synthetic secret resolution failed::/
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

test('CLI retries a transient Doppler failure and resolves on a later attempt', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-resolve-secrets-retry-'));
  try {
    writeFakeDoppler(
      root,
      `count_file="$TMPDOPPLERCOUNT"
count=$(cat "$count_file" 2>/dev/null || echo 0)
count=$((count + 1))
printf '%s' "$count" > "$count_file"
if [ "$count" -lt 3 ]; then
  exit 1
fi
printf '%s' '{"E2E_PROD_OTP_CHECK_TOKEN":"retried-otp-token"}'
`
    );
    const result = spawnSync(
      process.execPath,
      [SCRIPT.pathname, '--name', 'E2E_PROD_OTP_CHECK_TOKEN'],
      {
        encoding: 'utf8',
        env: {
          PATH: `${root}:${process.env.PATH}`,
          GITHUB_ACTIONS: 'true',
          GITHUB_ENV: join(root, 'github-env'),
          GITHUB_OUTPUT: join(root, 'github-output'),
          GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
          DOPPLER_TOKEN: 'doppler-token',
          DOPPLER_RETRY_BACKOFF_MS: '10,10',
          TMPDOPPLERCOUNT: join(root, 'doppler-calls'),
          E2E_PROD_OTP_CHECK_TOKEN: '',
        },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /E2E_PROD_OTP_CHECK_TOKEN source=doppler/);
    const exported = readFileSync(join(root, 'github-env'), 'utf8');
    assert.match(exported, /retried-otp-token/);
    assert.match(exported, /E2E_PROD_OTP_AVAILABLE<<[\s\S]*true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI reports a Doppler resolution failure without masquerading as missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-resolve-secrets-error-'));
  try {
    writeFakeDoppler(
      root,
      `if [ "$1 $2" = "secrets download" ]; then
  exit 7
fi
exit 1
`
    );
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT.pathname,
        '--name',
        'E2E_PROD_OTP_CHECK_TOKEN',
        '--name',
        'CRON_SECRET',
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: `${root}:${process.env.PATH}`,
          GITHUB_ACTIONS: 'true',
          GITHUB_ENV: join(root, 'github-env'),
          GITHUB_OUTPUT: join(root, 'github-output'),
          GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
          DOPPLER_TOKEN: 'doppler-token',
          DOPPLER_RETRY_BACKOFF_MS: '10,10',
          CRON_SECRET: '',
          E2E_PROD_OTP_CHECK_TOKEN: '',
        },
      }
    );
    // The step continues so the Doppler-free canaries still run; the failure
    // is surfaced as ::error:: and the OTP skip reason names the truth.
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /::error title=Synthetic secret resolution failed::E2E_PROD_OTP_CHECK_TOKEN: Doppler jovie-web\/prd read failed after 3 attempts \(exit-7\)\. This is a resolution failure, not a missing secret/
    );
    assert.match(
      result.stderr,
      /::error title=Synthetic secret resolution failed::CRON_SECRET: Doppler jovie-web\/prd read failed after 3 attempts \(exit-7\)/
    );
    assert.match(
      result.stderr,
      /E2E_PROD_OTP_CHECK_TOKEN source=doppler-error/
    );
    assert.doesNotMatch(
      result.stderr,
      /E2E_PROD_OTP_CHECK_TOKEN source=missing/
    );
    assert.doesNotMatch(
      result.stderr,
      /::warning::E2E_PROD_OTP_CHECK_TOKEN missing from GitHub secrets/
    );

    const exported = readFileSync(join(root, 'github-env'), 'utf8');
    assert.match(exported, /E2E_PROD_OTP_AVAILABLE<<[\s\S]*false/);
    assert.doesNotMatch(exported, /E2E_PROD_OTP_CHECK_TOKEN=/);

    const output = readFileSync(join(root, 'github-output'), 'utf8');
    assert.match(output, /otp_available=false/);
    assert.match(
      output,
      /otp_skip_reason<<[\s\S]*could not read E2E_PROD_OTP_CHECK_TOKEN[\s\S]*exit-7[\s\S]*not a verified missing secret/
    );

    const summary = readFileSync(join(root, 'summary.md'), 'utf8');
    assert.match(
      summary,
      /E2E_PROD_OTP_CHECK_TOKEN` \| doppler-error \(exit-7\)/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

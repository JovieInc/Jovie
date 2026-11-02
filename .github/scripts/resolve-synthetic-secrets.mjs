#!/usr/bin/env node
/**
 * Resolve named synthetic-monitoring secrets.
 *
 * GitHub Actions `secrets.*` values already in the environment win. Doppler
 * `jovie-web/prd` is consulted only when that value is empty, via one batched
 * `secrets download` read with bounded retries. The read distinguishes two
 * failure shapes that used to collapse into the same silent "missing" verdict:
 *
 * - verified absent: Doppler answered and the name is not in its store
 *   (`source: 'missing'`) — a config state, reported through the existing
 *   skip-with-reason path.
 * - read failure: Doppler errored, timed out, or returned unparseable output
 *   after every attempt (`source: 'doppler-error'`) — a resolution failure,
 *   reported with `::error::` and an unresolved skip reason. It is never
 *   reported as a missing secret (JOV-6813: the 2026-10-31 reds showed a
 *   resolution failure reading as "Tim-only secrets absent").
 *
 * Values are masked and written to GITHUB_ENV. Logs name the key and the
 * source only, never the value or Doppler's stderr.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const OTP_SECRET_NAMES = [
  'E2E_PROD_OTP_CHECK_ORIGIN',
  'E2E_PROD_OTP_CHECK_TOKEN',
  'E2E_PROD_OTP_CHECK_URL',
];

export const OPTIONAL_OTP_SKIP_MARKER = 'synthetic-otp-unavailable';

const DOPPLER_PROJECT = 'jovie-web';
const DOPPLER_CONFIG = 'prd';

// Attempts and backoffs for one batched Doppler read. The CLI already retries
// HTTP requests internally, but a fast failure (5xx, refused connection, bad
// token) surfaces immediately; the outer retry absorbs short-lived windows.
export const DOPPLER_READ_ATTEMPTS = 3;
const DOPPLER_RETRY_BACKOFF_MS = (
  process.env.DOPPLER_RETRY_BACKOFF_MS ?? '2000,5000'
)
  .split(',')
  .map(value => Number(value) || 0);

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSyntheticSecret({ name, githubValue, dopplerValue }) {
  const github = normalizeSecret(githubValue);
  if (github) return { name, value: github, source: 'github' };
  const doppler =
    dopplerValue && typeof dopplerValue === 'object'
      ? {
          value: normalizeSecret(dopplerValue.value),
          error: normalizeSecret(dopplerValue.error),
        }
      : { value: normalizeSecret(dopplerValue), error: '' };
  if (doppler.value) return { name, value: doppler.value, source: 'doppler' };
  if (doppler.error)
    return { name, value: '', source: 'doppler-error', error: doppler.error };
  return { name, value: '', source: 'missing' };
}

export function resolveSyntheticSecrets({ names, env, dopplerValues }) {
  const resolved = names.map(name =>
    resolveSyntheticSecret({
      name,
      githubValue: env[name],
      dopplerValue: dopplerValues?.[name],
    })
  );
  const requestedOtp = names.filter(name => OTP_SECRET_NAMES.includes(name));
  const missingOtp = resolved.filter(
    entry => requestedOtp.includes(entry.name) && entry.source === 'missing'
  );
  const erroredOtp = resolved.filter(
    entry =>
      requestedOtp.includes(entry.name) && entry.source === 'doppler-error'
  );
  const otpAvailable =
    requestedOtp.length === 0 ||
    (missingOtp.length === 0 && erroredOtp.length === 0);
  const missingOtpText =
    missingOtp.length > 0
      ? `missing ${missingOtp.map(entry => entry.name).join(', ')} (Tim-only Cloudflare mailbox secrets)`
      : '';
  const erroredOtpText =
    erroredOtp.length > 0
      ? `could not read ${erroredOtp
          .map(entry => entry.name)
          .join(
            ', '
          )} from Doppler jovie-web/prd after ${DOPPLER_READ_ATTEMPTS} attempts (${erroredOtp
          .map(entry => entry.error)
          .join(
            '; '
          )}) — Doppler resolution failure, not a verified missing secret. Re-run the workflow.`
      : '';
  const otpSkipReason = otpAvailable
    ? ''
    : erroredOtp.length === 0
      ? `Skipping OTP-dependent synthetic steps: ${missingOtpText}.`
      : `${OPTIONAL_OTP_SKIP_MARKER}: ${[missingOtpText, erroredOtpText]
          .filter(Boolean)
          .join('; ')}`;
  return { resolved, otpAvailable, otpSkipReason };
}

export function formatMaskLine(value) {
  return `::add-mask::${value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')}`;
}

function appendDelimited(path, name, value) {
  const delimiter = `JOVIE_${randomBytes(16).toString('hex')}`;
  appendFileSync(path, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function sleep(ms) {
  if (ms > 0)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, false, ms);
}

/**
 * Failure descriptor with no Doppler stderr content — stderr can echo
 * secret-adjacent material and must never reach the logs.
 */
export function describeDopplerFailure(result) {
  if (result.error) return `spawn-${result.error.code ?? 'error'}`;
  if (result.signal) return `signal-${result.signal}`;
  return `exit-${result.status ?? 'unknown'}`;
}

/**
 * One batched read for every name that is empty in the environment. Returns
 * `{ values, error }`: `values` maps the names Doppler actually served, and a
 * non-empty `error` (after all attempts) marks the whole read as failed so
 * callers can distinguish "absent" from "could not read".
 */
export function readDopplerSecrets(names) {
  if (!normalizeSecret(process.env.DOPPLER_TOKEN)) {
    return { values: {}, error: 'DOPPLER_TOKEN unconfigured' };
  }
  let lastError = '';
  for (let attempt = 1; attempt <= DOPPLER_READ_ATTEMPTS; attempt++) {
    const result = spawnSync(
      'doppler',
      [
        'secrets',
        'download',
        '--no-file',
        '--format',
        'json',
        // No fallback-file reads or writes on ephemeral CI runners: a stale
        // cached snapshot must never satisfy a fresh resolution.
        '--no-fallback',
        '--project',
        DOPPLER_PROJECT,
        '--config',
        DOPPLER_CONFIG,
        '--silent',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 45_000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    if (!result.error && result.status === 0) {
      try {
        const parsed = JSON.parse(result.stdout ?? '{}');
        const values = {};
        for (const name of names) {
          if (typeof parsed[name] === 'string') values[name] = parsed[name];
        }
        return { values, error: '' };
      } catch {
        lastError = 'unparseable-json';
      }
    } else {
      lastError = describeDopplerFailure(result);
    }
    if (attempt < DOPPLER_READ_ATTEMPTS) {
      sleep(DOPPLER_RETRY_BACKOFF_MS[attempt - 1]);
    }
  }
  return { values: {}, error: lastError };
}

function publish(name, value) {
  if (process.env.GITHUB_ENV)
    appendDelimited(process.env.GITHUB_ENV, name, value);
}

function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string', multiple: true },
    },
  });
  const names = values.name ?? [];
  if (names.length === 0) {
    process.stderr.write(
      '::error::resolve-synthetic-secrets requires at least one --name\n'
    );
    process.exit(1);
  }
  if (process.env.GITHUB_ACTIONS === 'true' && !process.env.GITHUB_ENV) {
    process.stderr.write(
      '::error::GITHUB_ENV is required to publish resolved secrets\n'
    );
    process.exit(1);
  }

  const needsDoppler = names.filter(
    name => !normalizeSecret(process.env[name])
  );
  const dopplerValues = {};
  let dopplerError = '';
  if (needsDoppler.length > 0) {
    const fetched = readDopplerSecrets(needsDoppler);
    dopplerError = fetched.error;
    for (const name of needsDoppler) {
      dopplerValues[name] =
        name in fetched.values ? fetched.values[name] : { error: dopplerError };
    }
  }
  const result = resolveSyntheticSecrets({
    names,
    env: process.env,
    dopplerValues,
  });

  for (const entry of result.resolved) {
    process.stderr.write(`secret ${entry.name} source=${entry.source}\n`);
    if (!entry.value) {
      if (entry.source === 'doppler-error') {
        process.stderr.write(
          `::error title=Synthetic secret resolution failed::${entry.name}: Doppler jovie-web/prd read failed after ${DOPPLER_READ_ATTEMPTS} attempts (${entry.error}). This is a resolution failure, not a missing secret; re-run the workflow or check DOPPLER_TOKEN_PRD.\n`
        );
      } else if (!OTP_SECRET_NAMES.includes(entry.name)) {
        process.stderr.write(
          `::warning::${entry.name} missing from GitHub secrets and Doppler jovie-web/prd\n`
        );
      }
      continue;
    }
    if (process.env.GITHUB_ACTIONS === 'true') {
      writeSync(1, `${formatMaskLine(entry.value)}\n`);
    }
    publish(entry.name, entry.value);
  }

  if (names.some(name => OTP_SECRET_NAMES.includes(name))) {
    publish('E2E_PROD_OTP_AVAILABLE', result.otpAvailable ? 'true' : 'false');
    publish('OTP_SKIP_REASON', result.otpSkipReason);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `otp_available=${result.otpAvailable ? 'true' : 'false'}\n`
      );
      appendDelimited(
        process.env.GITHUB_OUTPUT,
        'otp_skip_reason',
        result.otpSkipReason
      );
    }
    if (result.otpSkipReason) {
      process.stderr.write(
        `::warning title=Tim-only OTP secrets absent::${result.otpSkipReason}\n`
      );
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '### Synthetic secret resolution',
      '',
      '| Name | Source |',
      '| --- | --- |',
      ...result.resolved.map(
        entry =>
          `| \`${entry.name}\` | ${entry.source}${
            entry.error ? ` (${entry.error})` : ''
          } |`
      ),
    ];
    if (result.otpSkipReason) lines.push('', result.otpSkipReason);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

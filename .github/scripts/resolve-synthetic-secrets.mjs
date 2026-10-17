#!/usr/bin/env node
/**
 * Resolve named synthetic-monitoring secrets.
 *
 * GitHub Actions `secrets.*` values already in the environment win. Doppler
 * `jovie-web/prd` is consulted only when that value is empty. Values are
 * masked and written to GITHUB_ENV. Logs name the key and the source only.
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

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSyntheticSecret({ name, githubValue, dopplerValue }) {
  const github = normalizeSecret(githubValue);
  if (github) return { name, value: github, source: 'github' };
  const doppler = normalizeSecret(dopplerValue);
  if (doppler) return { name, value: doppler, source: 'doppler' };
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
  const otpAvailable = requestedOtp.length === 0 || missingOtp.length === 0;
  const otpSkipReason = otpAvailable
    ? ''
    : `Skipping OTP-dependent synthetic steps: missing ${missingOtp
        .map(entry => entry.name)
        .join(', ')} (Tim-only Cloudflare mailbox secrets).`;
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

function readDopplerSecret(name) {
  if (!normalizeSecret(process.env.DOPPLER_TOKEN)) return '';
  const result = spawnSync(
    'doppler',
    [
      'secrets',
      'get',
      name,
      '--project',
      DOPPLER_PROJECT,
      '--config',
      DOPPLER_CONFIG,
      '--plain',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    }
  );
  if (result.error || result.status !== 0) return '';
  return result.stdout ?? '';
}

function publish(name, value) {
  if (process.env.GITHUB_ENV) appendDelimited(process.env.GITHUB_ENV, name, value);
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

  const dopplerValues = {};
  for (const name of names) {
    if (!normalizeSecret(process.env[name])) {
      dopplerValues[name] = readDopplerSecret(name);
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
      if (!OTP_SECRET_NAMES.includes(entry.name)) {
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
    publish(
      'E2E_PROD_OTP_AVAILABLE',
      result.otpAvailable ? 'true' : 'false'
    );
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
        entry => `| \`${entry.name}\` | ${entry.source} |`
      ),
    ];
    if (result.otpSkipReason) lines.push('', result.otpSkipReason);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${lines.join('\n')}\n`
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

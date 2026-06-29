#!/usr/bin/env node
/**
 * CI Duration Ratchet CLI
 *
 * Usage:
 *   node scripts/ci-duration-ratchet.mjs validate
 *       Validate the baseline file structure. Exit 1 on error.
 *
 *   node scripts/ci-duration-ratchet.mjs check --p95 <seconds>
 *       Check whether a measured p95 (in seconds) exceeds the ratchet ceiling.
 *       Exit 0 = within SLO. Exit 1 = regression.
 *
 *   node scripts/ci-duration-ratchet.mjs update --p95 <seconds> --sample-size <n>
 *       Write a new (lower) p95 to the baseline when the ratchet is beaten.
 *       Refuses to write a higher p95 (use `check` for regression reporting).
 *       Pass --force to override the anti-regression guard.
 *
 * Environment:
 *   CI_DURATION_RATCHET_PATH  Override path to duration-ratchet.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDurationRatchetUpdate,
  checkRatchet,
  formatDuration,
  validateDurationRatchet,
} from './lib/ci-duration-ratchet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_BASELINE_PATH = resolve(
  REPO_ROOT,
  '.github/ci-harness/duration-ratchet.json'
);

function baselinePath() {
  return process.env.CI_DURATION_RATCHET_PATH
    ? resolve(process.env.CI_DURATION_RATCHET_PATH)
    : DEFAULT_BASELINE_PATH;
}

function loadBaseline() {
  return JSON.parse(readFileSync(baselinePath(), 'utf8'));
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

function hasArg(args, flag) {
  return args.includes(flag);
}

function runValidate() {
  const baseline = loadBaseline();
  const { ok, errors } = validateDurationRatchet(baseline);
  if (!ok) {
    console.error('[ci-duration-ratchet] ✗ Invalid baseline:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log('[ci-duration-ratchet] ✓ Baseline is valid.');
  console.log(
    `  p95GateSeconds : ${baseline.slo.p95GateSeconds}s (${formatDuration(baseline.slo.p95GateSeconds)})`
  );
  console.log(
    `  marginFraction : ${(baseline.slo.marginFraction * 100).toFixed(0)}%`
  );
  console.log(
    `  ceiling        : ${Math.round(baseline.slo.p95GateSeconds * (1 + baseline.slo.marginFraction))}s (${formatDuration(baseline.slo.p95GateSeconds * (1 + baseline.slo.marginFraction))})`
  );
}

function runCheck(args) {
  const rawP95 = argValue(args, '--p95');
  if (!rawP95) {
    console.error('[ci-duration-ratchet] ✗ Missing required --p95 <seconds>');
    process.exitCode = 1;
    return;
  }
  const measuredP95 = Number(rawP95);
  if (!Number.isFinite(measuredP95) || measuredP95 < 0) {
    console.error(
      `[ci-duration-ratchet] ✗ --p95 must be a non-negative number; got "${rawP95}"`
    );
    process.exitCode = 1;
    return;
  }

  const baseline = loadBaseline();
  const result = checkRatchet(measuredP95, baseline);

  const ceilingLabel = formatDuration(result.ceilingSeconds);
  const measuredLabel = formatDuration(result.measuredP95Seconds);
  const baselineLabel = formatDuration(result.baselineP95Seconds);

  console.log('[ci-duration-ratchet] p95 gate SLO check');
  console.log(`  baseline p95   : ${baselineLabel}`);
  console.log(
    `  margin         : ${(result.marginFraction * 100).toFixed(0)}%`
  );
  console.log(`  ceiling        : ${ceilingLabel}`);
  console.log(`  measured p95   : ${measuredLabel}`);

  if (result.ok) {
    console.log(
      `[ci-duration-ratchet] ✓ Within SLO — headroom ${formatDuration(result.headroomSeconds)}`
    );
  } else {
    const overage = formatDuration(Math.abs(result.headroomSeconds));
    console.error(
      `[ci-duration-ratchet] ✗ p95 EXCEEDS ceiling by ${overage} (${measuredLabel} > ${ceilingLabel})`
    );
    console.error(
      `  Remediation: speed up a merge-gate job or update the baseline after sustained improvement.`
    );
    console.error(
      `  Waiver: set "waiver" in .github/ci-harness/duration-ratchet.json with a future ISO date + reason.`
    );
    process.exitCode = 1;
  }
}

function runUpdate(args) {
  const rawP95 = argValue(args, '--p95');
  const rawSampleSize = argValue(args, '--sample-size');
  const force = hasArg(args, '--force');

  if (!rawP95) {
    console.error('[ci-duration-ratchet] ✗ Missing required --p95 <seconds>');
    process.exitCode = 1;
    return;
  }
  const newP95 = Number(rawP95);
  if (!Number.isFinite(newP95) || newP95 <= 0) {
    console.error(
      `[ci-duration-ratchet] ✗ --p95 must be a positive number; got "${rawP95}"`
    );
    process.exitCode = 1;
    return;
  }

  const baseline = loadBaseline();
  const currentP95 = baseline.slo.p95GateSeconds;
  const sampleSize = rawSampleSize
    ? Number(rawSampleSize)
    : baseline.sampleSize;

  const result = buildDurationRatchetUpdate(baseline, newP95, {
    force,
    sampleSize,
  });

  if (!result.ok) {
    console.error(
      `[ci-duration-ratchet] ✗ Refusing to raise p95 from ${currentP95}s to ${newP95}s.`
    );
    console.error(
      `  Use --force to override (requires explicit human sign-off in the PR).`
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(baselinePath(), `${JSON.stringify(result.updated, null, 2)}\n`);
  console.log(
    `[ci-duration-ratchet] ✓ Baseline updated: ${currentP95}s → ${newP95}s (${formatDuration(newP95)})`
  );
}

function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'validate':
      runValidate();
      break;
    case 'check':
      runCheck(args);
      break;
    case 'update':
      runUpdate(args);
      break;
    default:
      console.error(
        'Usage: node scripts/ci-duration-ratchet.mjs <validate|check|update>'
      );
      process.exitCode = 1;
  }
}

main();

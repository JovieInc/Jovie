#!/usr/bin/env node
// Pre-flight quota gate for a SARIF upload step (JOV-11801).
//
// The osv-scanner job's only recurring red on main (episodes 1-12, runs
// 42477294073 through 43569119431) was the pinned codeql upload-sarif action
// meeting the shared Actions installation token's empty REST bucket: every
// repo workflow draws from one roughly 1,000 calls/hour bucket against
// several times that demand, so pushes inside an exhausted window failed the
// job with "API rate limit exceeded for installation" after the scan itself
// had already succeeded. The workflow reads GET /rate_limit (which never
// spends the bucket it reports) through .github/scripts/gh-api-hold.sh and
// pipes the core resource here before the upload step runs.
//
// The gate is one decision, made from the bucket state only:
//   defer=true  when the bucket is too empty to carry the upload's own calls
//               (the action spends a handful of REST calls per run, and the
//               bucket drains continuously, so a low count predicts the 403
//               better than an exact zero does). The workflow then skips the
//               upload for this push, a visible github-quota-deferred
//               warning plus step summary mark it, and the next push uploads
//               fresh results.
//   defer=false otherwise; the upload runs and every real failure of it
//               still fails the job. The scan step is never deferred.
//
// This mirrors scripts/lib/github-installation-quota.mjs (quota defers,
// every other failure stays fatal) and the commit-signature-check degrade
// contract in .github/workflows/security.yml.
//
// CLI: sarif-upload-gate.mjs [--label osv] < quota.json
// where quota.json is the core rate-limit resource {limit, remaining, reset}.
// Emits defer=true/false to $GITHUB_OUTPUT. Malformed input fails closed
// (exit 1) so a broken gate never silently waves an upload through.

import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// The upload-sarif action spends roughly five REST calls per run (version
// check, status reports, the upload itself), and sibling jobs draw from the
// same bucket every second, so a bucket this close to empty will not carry
// the upload even though it is not exactly zero yet.
export const MIN_REMAINING_FOR_UPLOAD = 25;

const USAGE =
  'usage: sarif-upload-gate.mjs [--label osv] < quota.json ({limit, remaining, reset})';

/**
 * @param {string} text the core rate-limit resource as JSON
 * @returns {{remaining: number, reset: number, limit: number | null}}
 */
export function parseQuota(text) {
  const value = JSON.parse(String(text));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('quota is not a JSON object');
  }
  if (
    !Number.isFinite(Number(value.remaining)) ||
    !Number.isFinite(Number(value.reset))
  ) {
    throw new Error('quota needs numeric remaining and reset fields');
  }
  return {
    remaining: Number(value.remaining),
    reset: Number(value.reset),
    limit: Number.isFinite(Number(value.limit)) ? Number(value.limit) : null,
  };
}

/**
 * @param {{remaining: number, reset: number, limit: number | null}} quota
 * @returns {{defer: boolean, reason: string}}
 */
export function gateQuota(quota) {
  if (quota.remaining < MIN_REMAINING_FOR_UPLOAD) {
    const shown =
      quota.limit == null
        ? `remaining=${quota.remaining}`
        : `remaining=${quota.remaining} of ${quota.limit}`;
    return {
      defer: true,
      reason: `the shared Actions installation token bucket is too empty to carry the upload (${shown})`,
    };
  }
  return { defer: false, reason: 'the bucket has room for the upload' };
}

/**
 * @param {{label: string, quota: {remaining: number, reset: number, limit: number | null}}} input
 * @returns {{code: number, warning: string | null, output: string, summaryLine: string | null}}
 */
export function renderGate({ label, quota }) {
  const decision = gateQuota(quota);
  const output = `defer=${decision.defer ? 'true' : 'false'}`;
  if (!decision.defer) {
    return { code: 0, warning: null, output, summaryLine: null };
  }
  const resetIso = new Date(quota.reset * 1000).toISOString();
  const message = `${label} SARIF upload deferred: ${decision.reason}, and the window resets at ${resetIso}. This is not a verdict on the code; the scan step already ran, and the next push uploads fresh results.`;
  return {
    code: 0,
    warning: `::warning title=github-quota-deferred::${message}`,
    output,
    summaryLine: `- github-quota-deferred: ${message}`,
  };
}

/**
 * @param {string[]} [argv]
 * @param {{env?: Record<string, string | undefined>, readStdin?: () => string, stdout?: {write: (chunk: string) => void}, stderr?: {write: (chunk: string) => void}}} [io]
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2), io = {}) {
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const readStdin = io.readStdin ?? (() => readFileSync(0, 'utf8'));
  let label = 'SARIF';
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--label') {
      const next = args.shift();
      if (next == null) throw new Error(USAGE);
      label = next;
    } else {
      throw new Error(`unknown argument ${arg}\n${USAGE}`);
    }
  }
  let rendered;
  try {
    rendered = renderGate({ label, quota: parseQuota(readStdin()) });
  } catch (error) {
    stderr.write(
      `sarif-upload-gate: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }
  if (env.GITHUB_OUTPUT) {
    try {
      appendFileSync(env.GITHUB_OUTPUT, `${rendered.output}\n`);
    } catch (error) {
      stderr.write(
        `sarif-upload-gate: could not write the step output: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }
  } else {
    stdout.write(`${rendered.output}\n`);
  }
  if (rendered.warning) stdout.write(`${rendered.warning}\n`);
  if (rendered.summaryLine && env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${rendered.summaryLine}\n`);
    } catch {
      // The step summary is best-effort visibility; the warning already
      // marks the deferral on the run page.
    }
  }
  return rendered.code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}

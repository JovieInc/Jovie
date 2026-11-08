// Exact-fingerprint receipts for the trusted merged-tree source qualification.
//
// Source Validation re-runs on every PR metadata event (opened, edited,
// labeled, unlabeled). The #23748 proof reuse already skips the per-job proof
// steps for metadata-only edits, but the deterministic job's trusted-base
// disk-read qualification still executes on every flight: PR #24266 spent five
// ~10-minute heavy flights on one unchanged head (JOV-10354, 2026-11-02; ~41
// redundant heavy minutes), and a same-second opened+labeled burst still runs
// two full qualifications because an in-flight predecessor is not a completed
// proof. This module is the evidence owner for closing that gap: a flight may
// skip the merged-tree guards only when a receipt proves that an earlier
// Source Validation run qualified the EXACT same (head, base, merged-tree,
// toolchain, policy) fingerprint.
//
// The receipt is necessary but never sufficient: the referenced run must also
// exist, be completed and green on that exact head. Nothing here synthesizes a
// check conclusion or waives a proof; metadata-dependent checks (customer
// changelog, fleet rules, PR Ready joins) stay fresh in the workflow and are
// deliberately outside this fingerprint.
//
// The workflow half (JOV-10354; needs the GitHub workflows scope) wires:
//   fingerprint: `git merge-tree --write-tree <base> <head>` -> mergedTreeOid,
//                scripts/lib/ci-dependency-workspace.mjs
//                dependencyInputDigest(merged workspace)      -> toolchainDigest,
//                sha256 over the trusted-base selectSourceGuards selection
//                plus the source-validation workflow blob     -> policyDigest.
//   reuse:       restore the receipt recorded for the fingerprint, then this
//                CLI's `validate` with the referenced run record.
//   publish:     this CLI's `build` after a successful full qualification.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SOURCE_QUALIFICATION_SCHEMA = 'jovie-source-qualification/v1';
export const QUALIFICATION_WORKFLOW_PATH =
  '.github/workflows/source-validation.yml';
export const QUALIFICATION_RECEIPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const GIT_OID = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const POSITIVE_INT = /^[1-9]\d*$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

/** @typedef {[component: string, inputKey: string, pattern: RegExp]} QualificationComponent */

/** @type {QualificationComponent[]} */
const COMPONENTS = [
  ['head', 'headSha', GIT_OID],
  ['base', 'baseSha', GIT_OID],
  ['mergedTree', 'mergedTreeOid', GIT_OID],
  ['toolchain', 'toolchainDigest', SHA256],
  ['policy', 'policyDigest', SHA256],
];

/**
 * @typedef {Object} QualificationFingerprintInput
 * @property {string} headSha - exact PR head commit (40-hex).
 * @property {string} baseSha - merge-target tip the qualification judged (40-hex).
 * @property {string} mergedTreeOid - `git merge-tree --write-tree <base> <head>` tree (40-hex).
 * @property {string} toolchainDigest - dependencyInputDigest of the merged workspace (64-hex).
 * @property {string} policyDigest - digest of the guard selection + workflow policy (64-hex).
 */

/**
 * Validate a fingerprint input. Unknown keys are ignored on purpose: PR
 * title, body and labels are metadata, not tree identity, and must never
 * invalidate (or validate) a merged-tree qualification.
 * @param {Partial<QualificationFingerprintInput>} [input]
 * @returns {{valid: boolean, errors: string[], values: Record<string, string> | null}}
 */
export function validateQualificationFingerprintInput(input) {
  const errors = [];
  /** @type {Record<string, string>} */
  const values = {};
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { valid: false, errors: ['fingerprint-input:input'], values: null };
  for (const [component, key, pattern] of COMPONENTS) {
    const value = input[key];
    if (typeof value !== 'string' || !pattern.test(value))
      errors.push(`fingerprint-input:${component}`);
    else values[component] = value;
  }
  return { valid: errors.length === 0, errors, values };
}

/**
 * Canonical fingerprint over the exact qualification identity. Two flights
 * share a fingerprint only when every component is byte-identical.
 * @param {Partial<QualificationFingerprintInput>} input
 * @returns {string | null} 64-hex sha256, or null when the input is invalid.
 */
export function computeQualificationFingerprint(input) {
  const { valid, values } = validateQualificationFingerprintInput(input);
  if (!valid || !values) return null;
  return createHash('sha256')
    .update(
      `${JSON.stringify({
        schema: SOURCE_QUALIFICATION_SCHEMA,
        ...Object.fromEntries(
          COMPONENTS.map(([component]) => [component, values[component]])
        ),
      })}\n`
    )
    .digest('hex');
}

/**
 * @typedef {Object} QualificationReceipt
 * @property {typeof SOURCE_QUALIFICATION_SCHEMA} schema
 * @property {string} fingerprint
 * @property {string} head
 * @property {string} base
 * @property {string} mergedTree
 * @property {string} toolchain
 * @property {string} policy
 * @property {number} runId
 * @property {number} runAttempt
 * @property {string} workflowPath
 * @property {string} repository
 * @property {string} issuedAt
 */

/**
 * Publish the receipt a green full qualification earns. Returns null when any
 * input is invalid; callers must treat that as "no proof" and re-qualify.
 * @param {QualificationFingerprintInput & {
 *   runId: number, runAttempt: number, repository: string,
 *   workflowPath?: string, issuedAt?: string,
 * }} input
 * @returns {QualificationReceipt | null}
 */
export function buildQualificationReceipt(input) {
  const fingerprint = computeQualificationFingerprint(input);
  if (
    fingerprint === null ||
    !POSITIVE_INT.test(String(input?.runId ?? '')) ||
    !POSITIVE_INT.test(String(input?.runAttempt ?? '')) ||
    !REPOSITORY.test(input?.repository ?? '') ||
    (input?.workflowPath !== undefined &&
      (typeof input.workflowPath !== 'string' || input.workflowPath === ''))
  )
    return null;
  const workflowPath = input.workflowPath || QUALIFICATION_WORKFLOW_PATH;
  const issuedAt =
    typeof input.issuedAt === 'string' && ISO_TIME.test(input.issuedAt)
      ? input.issuedAt
      : new Date().toISOString();
  return {
    schema: SOURCE_QUALIFICATION_SCHEMA,
    fingerprint,
    head: input.headSha,
    base: input.baseSha,
    mergedTree: input.mergedTreeOid,
    toolchain: input.toolchainDigest,
    policy: input.policyDigest,
    runId: Number(input.runId),
    runAttempt: Number(input.runAttempt),
    workflowPath,
    repository: input.repository,
    issuedAt,
  };
}

/**
 * @typedef {Object} QualificationRunEvidence
 * @property {number} id
 * @property {number} [run_attempt]
 * @property {string} [status]
 * @property {string} [conclusion]
 * @property {string} [head_sha]
 * @property {string} [path]
 * @property {string} [event]
 */

/**
 * Fail-closed reuse verdict for one flight. `allowed` is true only when the
 * receipt is well-formed, unexpired, exactly fingerprint-matching AND the
 * referenced run completed green on the same head and workflow. Every other
 * combination blocks, so the caller re-runs the full heavy qualification.
 * @param {{
 *   receipt?: QualificationReceipt | null,
 *   expected?: Partial<QualificationFingerprintInput>,
 *   run?: QualificationRunEvidence | null,
 *   now?: () => number,
 *   maxAgeMs?: number,
 * }} [options]
 * @returns {{schema: string, allowed: boolean, blockers: string[], fingerprint: string | null}}
 */
export function evaluateQualificationReuse({
  receipt,
  expected,
  run,
  now = () => Date.now(),
  maxAgeMs = QUALIFICATION_RECEIPT_MAX_AGE_MS,
} = {}) {
  const blockers = [];
  const verdict = fingerprint => ({
    schema: SOURCE_QUALIFICATION_SCHEMA,
    allowed: false,
    blockers,
    fingerprint,
  });
  const input = validateQualificationFingerprintInput(expected);
  if (!input.valid) {
    blockers.push('expected-malformed');
    return verdict(null);
  }
  const fingerprint = computeQualificationFingerprint(expected);
  if (receipt === null || receipt === undefined) {
    blockers.push('receipt-missing');
    return verdict(fingerprint);
  }
  if (typeof receipt !== 'object' || Array.isArray(receipt)) {
    blockers.push('receipt-malformed');
    return verdict(fingerprint);
  }
  if (
    receipt.schema !== SOURCE_QUALIFICATION_SCHEMA ||
    typeof receipt.fingerprint !== 'string' ||
    !SHA256.test(receipt.fingerprint) ||
    COMPONENTS.some(
      ([component, , pattern]) =>
        typeof receipt[component] !== 'string' ||
        !pattern.test(receipt[component])
    ) ||
    !POSITIVE_INT.test(String(receipt.runId ?? '')) ||
    !POSITIVE_INT.test(String(receipt.runAttempt ?? '')) ||
    typeof receipt.workflowPath !== 'string' ||
    receipt.workflowPath === '' ||
    !REPOSITORY.test(receipt.repository ?? '') ||
    typeof receipt.issuedAt !== 'string' ||
    !ISO_TIME.test(receipt.issuedAt)
  ) {
    blockers.push('receipt-malformed');
    return verdict(fingerprint);
  }
  // A receipt whose own fields disagree with its fingerprint was tampered
  // with (or truncated) after publication; it proves nothing.
  const selfFingerprint = computeQualificationFingerprint({
    headSha: receipt.head,
    baseSha: receipt.base,
    mergedTreeOid: receipt.mergedTree,
    toolchainDigest: receipt.toolchain,
    policyDigest: receipt.policy,
  });
  if (selfFingerprint !== receipt.fingerprint)
    blockers.push('fingerprint-inconsistent');
  for (const [component] of COMPONENTS)
    if (receipt[component] !== input.values[component])
      blockers.push(`fingerprint-mismatch:${component}`);
  const age = now() - Date.parse(receipt.issuedAt);
  if (!Number.isFinite(age)) blockers.push('receipt-malformed');
  else if (age < 0 || age > maxAgeMs) blockers.push('receipt-expired');
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    blockers.push('run-evidence-missing');
    return verdict(fingerprint);
  }
  if (run.id !== receipt.runId) blockers.push('run-mismatch');
  if (run.run_attempt !== receipt.runAttempt)
    blockers.push('run-attempt-mismatch');
  if (run.status !== 'completed') blockers.push('run-incomplete');
  if (run.conclusion !== 'success') blockers.push('run-failed');
  if (run.head_sha !== expected.headSha) blockers.push('run-head-mismatch');
  if (run.path !== receipt.workflowPath) blockers.push('run-workflow-mismatch');
  if (run.event !== 'pull_request') blockers.push('run-event-mismatch');
  return {
    schema: SOURCE_QUALIFICATION_SCHEMA,
    allowed: blockers.length === 0,
    blockers,
    fingerprint,
  };
}

/**
 * @typedef {Object} QualificationFlight
 * @property {string} event - the pull_request action that fired the flight.
 * @property {string} createdAt - when the event fired (ISO 8601 Z).
 * @property {string} completedAt - when the flight's final proof completed (ISO 8601 Z).
 * @property {boolean} [heavy] - the flight re-ran the merged-tree qualification.
 * @property {number} [heavyMinutes] - wall minutes of heavy qualification the flight spent.
 */

const nearestRank = (sorted, percentile) => {
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
};

/**
 * Summarize one burst of Source Validation flights sharing an identical
 * (head, base, merged-tree, toolchain, policy) fingerprint. Callers group by
 * fingerprint first; this never guesses identity. Records with unparseable
 * timestamps are ignored, never averaged in.
 * @param {QualificationFlight[]} flights
 */
export function summarizeQualificationFlights(flights) {
  const valid = (Array.isArray(flights) ? flights : []).filter(
    flight =>
      flight &&
      typeof flight === 'object' &&
      ISO_TIME.test(flight.createdAt ?? '') &&
      ISO_TIME.test(flight.completedAt ?? '')
  );
  const seconds = valid
    .map(
      flight =>
        (Date.parse(flight.completedAt) - Date.parse(flight.createdAt)) / 1000
    )
    .sort((a, b) => a - b);
  const heavy = valid.filter(flight => flight.heavy === true);
  const redundantHeavyMinutes =
    Math.round(
      heavy
        .slice(1)
        .reduce((sum, flight) => sum + (Number(flight.heavyMinutes) || 0), 0) *
        10
    ) / 10;
  const burstAdmissionSeconds = valid.length
    ? (Math.max(...valid.map(f => Date.parse(f.completedAt))) -
        Math.min(...valid.map(f => Date.parse(f.createdAt)))) /
      1000
    : 0;
  return {
    n: valid.length,
    heavyQualifications: heavy.length,
    redundantHeavyQualifications: Math.max(0, heavy.length - 1),
    redundantHeavyMinutes,
    eventToAdmissionSeconds: {
      n: seconds.length,
      p50: nearestRank(seconds, 50),
      p95: nearestRank(seconds, 95),
      max: seconds.length ? seconds[seconds.length - 1] : null,
    },
    burstAdmissionSeconds,
  };
}

function cliValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function cliReadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label} unreadable: ${path}`);
  }
}

/** CLI: fingerprint | build | validate (see the module header). */
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const usage = () => {
    console.error(
      'usage: source-qualification-receipt.mjs <fingerprint|build|validate> [flags]'
    );
    process.exitCode = 2;
  };
  if (command === 'fingerprint') {
    const input = {
      headSha: cliValue(args, '--head'),
      baseSha: cliValue(args, '--base'),
      mergedTreeOid: cliValue(args, '--tree'),
      toolchainDigest: cliValue(args, '--toolchain'),
      policyDigest: cliValue(args, '--policy'),
    };
    const fingerprint = computeQualificationFingerprint(input);
    if (fingerprint === null) {
      console.error(
        JSON.stringify({
          schema: SOURCE_QUALIFICATION_SCHEMA,
          fingerprint: null,
          errors: validateQualificationFingerprintInput(input).errors,
        })
      );
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ fingerprint }));
    return;
  }
  if (command === 'build') {
    const receipt = buildQualificationReceipt({
      headSha: cliValue(args, '--head'),
      baseSha: cliValue(args, '--base'),
      mergedTreeOid: cliValue(args, '--tree'),
      toolchainDigest: cliValue(args, '--toolchain'),
      policyDigest: cliValue(args, '--policy'),
      runId: Number(cliValue(args, '--run-id')),
      runAttempt: Number(cliValue(args, '--run-attempt')),
      repository: cliValue(args, '--repository'),
      workflowPath: cliValue(args, '--workflow-path'),
      issuedAt: cliValue(args, '--issued-at'),
    });
    if (receipt === null) {
      console.error('build: invalid receipt inputs');
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(receipt));
    return;
  }
  if (command === 'validate') {
    const receiptPath = cliValue(args, '--receipt-file');
    const expectedPath = cliValue(args, '--expected-file');
    const runPath = cliValue(args, '--run-file');
    if (!receiptPath || !expectedPath || !runPath) return usage();
    const verdict = evaluateQualificationReuse({
      receipt: cliReadJson(receiptPath, 'receipt'),
      expected: cliReadJson(expectedPath, 'expected'),
      run: cliReadJson(runPath, 'run'),
      maxAgeMs: Number(cliValue(args, '--max-age-ms')) || undefined,
    });
    console.log(JSON.stringify(verdict));
    process.exitCode = verdict.allowed ? 0 : 1;
    return;
  }
  return usage();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(`source-qualification-receipt: ${error.message}`);
    process.exitCode = 1;
  }
}

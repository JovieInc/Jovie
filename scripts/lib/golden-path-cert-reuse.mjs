/**
 * Golden Path certification carry-forward (JOV-14402).
 *
 * A certification belongs to the release SHA it passed on. It does not decay
 * with time (the 24 h window and JOV-12639's 11 h exact-SHA reuse are gone).
 * For the served release, each step is one of:
 *
 * - current: it already passed on this exact SHA, so nothing runs (the 12 h
 *   clock tick on unchanged code certifies nothing again);
 * - carried: it passed on an earlier release and nothing between that
 *   release and this one touches the step's files, routes or deps, so its
 *   certification carries forward and a carried receipt is posted for this
 *   SHA naming where it came from;
 * - recertify: anything else. The release touches the step, the step never
 *   passed, a failure since then cleared its pass (new evidence, not decay),
 *   the ledger could not be read, or the run was forced.
 *
 * The rule is pure here; scripts/golden-path-cert-reuse.mjs feeds it the
 * ledger and a git diff, and golden-path-step-scope.mjs decides "touches".
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { SURFACE_IDS } from './prod-cert.mjs';

export const CARRY_SCHEMA = 'jovie.golden-path-carry/v1';
export const CERTIFIED_SCHEMA = 'jovie.prod-golden-path-certified/v1';
export const WORKFLOW_PATH = '.github/workflows/postdeploy-probes.yml';
const SHA = /^[0-9a-f]{40}$/u;

// Entry points whose relative-import closure decides a certification.
export const PRODUCER_ENTRIES = Object.freeze([
  'scripts/prod-cert.mjs',
  'scripts/golden-path-cert-reuse.mjs',
  'scripts/invariants/pen-golden-path.mjs',
  'scripts/invariants/pen-still-diff.mjs',
  'scripts/lib/golden-path-cert-reuse.mjs',
]);
// Data and policy files the closure reads rather than imports.
export const PRODUCER_DATA = Object.freeze([
  'docs/pen-stills/golden-path/manifest.json',
  WORKFLOW_PATH,
]);
const RELATIVE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/gu;

/**
 * Sorted repo-relative files of the certification producer: the entries, every
 * module they reach by relative import, and the data files. A change to any of
 * them re-certifies every step.
 * @param {string} root
 * @returns {string[]}
 */
export function producerFiles(root) {
  const seen = new Set();
  const visit = (/** @type {string} */ file) => {
    if (seen.has(file) || !existsSync(join(root, file))) return;
    seen.add(file);
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(RELATIVE_IMPORT)) {
      const next = normalize(
        relative(root, join(root, dirname(file), match[1]))
      );
      if (/\.(?:mjs|js|cjs|json)$/u.test(next) && !next.startsWith('..'))
        visit(next);
    }
  };
  for (const entry of PRODUCER_ENTRIES) visit(entry);
  for (const file of PRODUCER_DATA)
    if (existsSync(join(root, file))) seen.add(file);
  return [...seen].sort();
}

/**
 * @typedef {{ sha: string, endedAt: string, runUrl: string | null }} PassRef
 * @typedef {PassRef & { carriedFrom?: PassRef | null }} LastPassed
 * @typedef {{ servedSha: string | null, surfaces: Record<string, { lastPassed: LastPassed | null }> }} LedgerCertifications
 */

const isIso = (/** @type {unknown} */ value) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** @param {any} value @returns {value is PassRef} */
function isPassRef(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    SHA.test(String(value.sha)) &&
    isIso(value.endedAt) &&
    (value.runUrl === null || typeof value.runUrl === 'string')
  );
}

/**
 * Read the ledger GET body (golden-path-evidence route.ts). Anything that is
 * not the current shape returns null, and null re-certifies every step: a
 * build that predates per-surface certifications carries nothing.
 * @param {any} body
 * @returns {LedgerCertifications | null}
 */
export function readLedgerCertifications(body) {
  if (
    typeof body !== 'object' ||
    body === null ||
    body.schema !== CERTIFIED_SCHEMA ||
    body.ledger !== 'present' ||
    typeof body.surfaces !== 'object' ||
    body.surfaces === null
  )
    return null;
  /** @type {LedgerCertifications['surfaces']} */
  const surfaces = {};
  for (const id of SURFACE_IDS) {
    const last = body.surfaces[id]?.lastPassed ?? null;
    if (last === null) {
      surfaces[id] = { lastPassed: null };
      continue;
    }
    const from = last.carriedFrom ?? null;
    if (!isPassRef(last) || (from !== null && !isPassRef(from))) return null;
    surfaces[id] = {
      lastPassed: {
        sha: last.sha,
        endedAt: last.endedAt,
        runUrl: last.runUrl,
        carriedFrom: from,
      },
    };
  }
  return {
    servedSha: SHA.test(String(body.servedSha)) ? body.servedSha : null,
    surfaces,
  };
}

/**
 * The run that actually exercised a step: a carried pass names it in
 * carriedFrom, so a chain of carries always diffs from the real evidence.
 * @param {LastPassed} last
 * @returns {PassRef}
 */
export function exercisedPass(last) {
  const from = last.carriedFrom ?? last;
  return { sha: from.sha, endedAt: from.endedAt, runUrl: from.runUrl };
}

/**
 * @typedef {{ all: boolean, steps: readonly string[], why?: Record<string, string>, reason?: string | null }} Touched
 * @typedef {{ schema: string, servedSha: string, decidedAt: string, current: string[], carried: { surface: string, from: PassRef }[], recertify: { surface: string, why: string }[] }} CarryPlan
 */

/**
 * Decide, per step, whether the served release is already certified, carries
 * a certification forward, or re-certifies.
 * @param {{
 *   servedSha: string,
 *   ledger: LedgerCertifications | null,
 *   touched: (fromSha: string) => Touched,
 *   force?: boolean,
 *   nowMs?: number,
 * }} input
 * @returns {CarryPlan}
 */
export function decideCarry({
  servedSha,
  ledger,
  touched,
  force = false,
  nowMs = Date.now(),
}) {
  /** @type {CarryPlan} */
  const plan = {
    schema: CARRY_SCHEMA,
    servedSha,
    decidedAt: new Date(nowMs).toISOString(),
    current: [],
    carried: [],
    recertify: [],
  };
  const everyStep = (/** @type {string} */ why) => {
    plan.recertify = SURFACE_IDS.map(surface => ({ surface, why }));
    return plan;
  };
  if (!SHA.test(String(servedSha))) return everyStep('no exact served SHA');
  if (force) return everyStep('forced');
  if (!ledger) return everyStep('the certification ledger was not readable');
  /** @type {Map<string, Touched>} */
  const diffs = new Map();
  for (const surface of SURFACE_IDS) {
    const last = ledger.surfaces[surface]?.lastPassed ?? null;
    if (!last) {
      plan.recertify.push({
        surface,
        why: 'no pass to carry (never passed, or failed since)',
      });
      continue;
    }
    if (last.sha === servedSha) {
      plan.current.push(surface);
      continue;
    }
    const from = exercisedPass(last);
    let diff = diffs.get(from.sha);
    if (!diff) {
      try {
        diff = touched(from.sha);
      } catch (error) {
        diff = {
          all: true,
          steps: SURFACE_IDS,
          reason: `diff from ${from.sha.slice(0, 8)} unavailable (${error instanceof Error ? error.message : 'unknown'})`,
        };
      }
      diffs.set(from.sha, diff);
    }
    if (diff.all || diff.steps.includes(surface)) {
      plan.recertify.push({
        surface,
        why:
          diff.why?.[surface] ??
          diff.reason ??
          `touched since ${from.sha.slice(0, 8)}`,
      });
      continue;
    }
    plan.carried.push({ surface, from });
  }
  return plan;
}

/** True when every step already passed on the served SHA. */
export function allCurrent(/** @type {CarryPlan} */ plan) {
  return plan.current.length === SURFACE_IDS.length;
}

/**
 * Check a plan read back from a file or a workflow output before it is used
 * to post receipts. Anything off returns null, and the caller certifies every
 * step instead.
 * @param {any} plan
 * @returns {CarryPlan | null}
 */
export function parseCarryPlan(plan) {
  if (
    typeof plan !== 'object' ||
    plan === null ||
    plan.schema !== CARRY_SCHEMA ||
    !SHA.test(String(plan.servedSha)) ||
    !Array.isArray(plan.current) ||
    !Array.isArray(plan.carried) ||
    !Array.isArray(plan.recertify)
  )
    return null;
  const named = [
    ...plan.current,
    ...plan.carried.map(c => c?.surface),
    ...plan.recertify.map(r => r?.surface),
  ];
  if (
    named.length !== SURFACE_IDS.length ||
    new Set(named).size !== SURFACE_IDS.length ||
    !SURFACE_IDS.every(id => named.includes(id)) ||
    !plan.carried.every(c => isPassRef(c.from) && c.from.sha !== plan.servedSha)
  )
    return null;
  return plan;
}

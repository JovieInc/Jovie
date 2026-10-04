#!/usr/bin/env node
/**
 * Screen audit (JOV-7713): every SCREEN_REGISTRY screen through the gate stack.
 *
 * Composes evidence the existing producers already emit; it renders nothing
 * and certifies nothing itself:
 * - route DOM certification snapshots (screenshots.yml, PR Visual Review)
 * - screen-browser-proof measurements (the per-screen proof specs)
 * - an optional coherence judge result (intent, continuity, subtraction,
 *   seams, inevitability), which blocks only on specific findings.
 *
 * Verdicts: `red` (specific findings), `uncovered` (no rendered producer),
 * `missing-evidence` (a producer exists but this run has no receipt) and
 * `green`. Nothing missing is ever counted green.
 *
 * Usage:
 *   node scripts/invariants/screen-audit.mjs --artifacts <dir> [--judge <json>]
 *     [--out <ledger.json>] [--file [--dry-run]]
 *   node scripts/invariants/screen-audit.mjs --changed <paths.txt>
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readAssuranceMatrix,
  uiEvidenceRequirements,
} from './assurance-matrix.mjs';
import {
  CLS_INTERACTION_BUDGET,
  classifyScreenPath,
  SCREEN_MARKETING_ROUTES,
  SCREEN_PROOF_ROUTES,
  SCREEN_REGISTRY,
} from './screen-certification.mjs';

export const SCREEN_AUDIT_SCHEMA = 'screen-audit/v1';
export const JUDGE_PRINCIPLES = Object.freeze([
  'intent',
  'continuity',
  'subtraction',
  'seams',
  'inevitability',
]);
const PROFILE_SCREEN = 'web.public-profile';
const PROFILE_ROUTE = '/unfazed';

/** @param {string} screenId */
export function screenProducer(screenId) {
  if (Object.hasOwn(SCREEN_MARKETING_ROUTES, screenId))
    return {
      kind: 'marketing-route',
      route: SCREEN_MARKETING_ROUTES[screenId],
    };
  if (Object.hasOwn(SCREEN_PROOF_ROUTES, screenId))
    return { kind: 'proof-route', route: SCREEN_PROOF_ROUTES[screenId] };
  return { kind: 'none', route: null };
}

function walk(dir, name, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, name, found);
    else if (entry.name === name) found.push(path);
  }
  return found;
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Load route DOM snapshots and screen proofs from a directory of downloaded
 * producer artifacts (any nesting).
 */
export function loadArtifacts(root) {
  const routeDom = new Map();
  let headSha = null;
  for (const receiptPath of walk(root, 'receipt.json')) {
    const receipt = readJson(receiptPath);
    if (receipt?.schemaVersion !== 'jovie-route-dom-certification/v1') continue;
    headSha ??= receipt.sourceGitSha ?? null;
    for (const item of receipt.receipts ?? []) {
      const snapshot = readJson(join(dirname(receiptPath), item.snapshotPath));
      const list = routeDom.get(item.route) ?? [];
      list.push({
        viewport: item.viewport,
        state: item.state,
        findings: snapshot.findings ?? [],
      });
      routeDom.set(item.route, list);
    }
  }
  const proofs = new Map();
  for (const proofPath of walk(root, 'screen-proof.json')) {
    const proof = readJson(proofPath);
    if (typeof proof?.screenId === 'string') proofs.set(proof.screenId, proof);
  }
  return { headSha, routeDom, proofs };
}

/** Measurement findings only; provenance belongs to the certification gate. */
export function proofMeasurementFindings(proof) {
  const findings = [];
  for (const viewport of proof?.viewports ?? []) {
    const at = `viewport ${viewport?.id ?? '<missing>'}`;
    if (viewport?.rendered !== true) findings.push(`${at}: not rendered`);
    if (viewport?.axe?.violations !== 0)
      findings.push(
        `${at}: ${viewport?.axe?.violations ?? 'unmeasured'} axe violations`
      );
    const overflow = viewport?.overflow?.maxHorizontalPx;
    if (typeof overflow !== 'number' || overflow > 1)
      findings.push(`${at}: horizontal overflow ${overflow ?? 'unmeasured'}px`);
    const cls = viewport?.cls?.value;
    if (typeof cls !== 'number' || cls > CLS_INTERACTION_BUDGET)
      findings.push(
        `${at}: CLS ${cls ?? 'unmeasured'} over ${CLS_INTERACTION_BUDGET}`
      );
    if (viewport?.interaction?.passed !== true)
      findings.push(`${at}: interaction check failed`);
    if (viewport?.contrast && viewport.contrast.passed !== true)
      findings.push(`${at}: contrast check failed`);
    for (const [key, count] of Object.entries(viewport?.runtime ?? {}))
      if (typeof count === 'number' && count > 0)
        findings.push(`${at}: ${count} ${key}`);
  }
  return findings;
}

const domFinding = (receipt, finding) =>
  `${receipt.viewport}${receipt.state && receipt.state !== 'default' ? `/${receipt.state}` : ''}: ${finding.kind} ${(finding.elements ?? []).join(' ')}`.trim();

/** Judge findings must name a principle and a specific element or evidence. */
export function specificJudgeFindings(findings) {
  return (Array.isArray(findings) ? findings : []).filter(
    finding =>
      JUDGE_PRINCIPLES.includes(finding?.principle) &&
      typeof finding?.finding === 'string' &&
      finding.finding.trim() !== '' &&
      typeof finding?.evidence === 'string' &&
      finding.evidence.trim() !== ''
  );
}

/**
 * @param {{ registry?: readonly object[], routeDom?: Map<string, object[]>,
 *   proofs?: Map<string, object>, judge?: Record<string, object[]> | null,
 *   headSha?: string | null }} input
 */
export function auditScreens({
  registry = SCREEN_REGISTRY,
  routeDom = new Map(),
  proofs = new Map(),
  judge = null,
  headSha = null,
} = {}) {
  const screens = [];
  for (const screen of registry) {
    if (screen.excluded) continue;
    const producer = screenProducer(screen.id);
    const findings = [];
    let evidence = false;
    if (producer.kind === 'marketing-route' || screen.id === PROFILE_SCREEN) {
      const receipts = routeDom.get(producer.route ?? PROFILE_ROUTE) ?? [];
      evidence ||= receipts.length > 0;
      for (const receipt of receipts)
        for (const finding of receipt.findings)
          findings.push(domFinding(receipt, finding));
    }
    const proof = proofs.get(screen.id);
    if (proof) {
      evidence = true;
      findings.push(...proofMeasurementFindings(proof));
    }
    const judged = judge ? specificJudgeFindings(judge[screen.id]) : [];
    for (const item of judged)
      findings.push(
        `judge ${item.principle}: ${item.finding} (${item.evidence})`
      );
    const verdict =
      findings.length > 0
        ? 'red'
        : producer.kind === 'none'
          ? 'uncovered'
          : evidence
            ? 'green'
            : 'missing-evidence';
    screens.push({
      id: screen.id,
      platform: screen.platform,
      owner: screen.owner,
      producer: producer.kind,
      verdict,
      judge: judge
        ? Object.hasOwn(judge, screen.id)
          ? 'judged'
          : 'not-judged'
        : 'unavailable',
      findings,
    });
  }
  const totals = { screens: screens.length };
  for (const screen of screens)
    totals[screen.verdict] = (totals[screen.verdict] ?? 0) + 1;
  return { schema: SCREEN_AUDIT_SCHEMA, headSha, totals, screens };
}

/**
 * Remediation plans for the existing Linear intake: one issue per red screen
 * plus one rollup each for uncovered and missing-evidence screens. Stable
 * fingerprints make the nightly sweep update rather than duplicate.
 */
export function remediationPlans(ledger) {
  const plans = [];
  const at = ledger.headSha ? ` on ${ledger.headSha.slice(0, 12)}` : '';
  for (const screen of ledger.screens.filter(item => item.verdict === 'red')) {
    plans.push({
      fingerprint: `screen-audit:${screen.id}`,
      title: `Screen audit: ${screen.id} has ${screen.findings.length} finding${screen.findings.length === 1 ? '' : 's'}`,
      description: [
        `Nightly screen audit (JOV-7713)${at}. Owner: ${screen.owner}. Producer: ${screen.producer}.`,
        '',
        ...screen.findings.map(finding => `- ${finding}`),
        '',
        'Fix the product, then shrink any ratchet baseline that records these findings.',
      ].join('\n'),
      priority: 2,
    });
  }
  for (const [verdict, why] of [
    ['uncovered', 'have no rendered producer, so no gate ever sees them'],
    [
      'missing-evidence',
      'have a producer but no receipt in the latest main run',
    ],
  ]) {
    const list = ledger.screens.filter(item => item.verdict === verdict);
    if (list.length === 0) continue;
    plans.push({
      fingerprint: `screen-audit:${verdict}`,
      title: `Screen audit: ${list.length} inventory screens ${verdict === 'uncovered' ? 'are uncovered' : 'are missing evidence'}`,
      description: [
        `Nightly screen audit (JOV-7713)${at}: these screens ${why}.`,
        '',
        ...list.map(item => `- ${item.id} (${item.platform}, ${item.owner})`),
      ].join('\n'),
      priority: 3,
    });
  }
  return plans;
}

/**
 * Per-PR manifest for the Validating lifecycle: changed inventory screens,
 * their producer, and the UI matrix rows the change invalidates.
 */
export function changedScreenManifest(
  changedPaths,
  matrix = readAssuranceMatrix()
) {
  const screens = new Map();
  const unregistered = [];
  for (const path of changedPaths) {
    const { kind, entry } = classifyScreenPath(path);
    if (kind === 'registered') {
      const known = screens.get(entry.id) ?? {
        screenId: entry.id,
        platform: entry.platform,
        viewports: entry.viewports,
        producer: screenProducer(entry.id).kind,
        paths: [],
      };
      known.paths.push(path);
      screens.set(entry.id, known);
    } else if (kind === 'unregistered') unregistered.push(path);
  }
  return {
    schema: 'screen-audit-manifest/v1',
    screens: [...screens.values()],
    unregistered,
    requirements: uiEvidenceRequirements(matrix, changedPaths),
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const changed = argument('--changed');
  if (changed) {
    const paths = readFileSync(changed, 'utf8').split('\n').filter(Boolean);
    process.stdout.write(
      `${JSON.stringify(changedScreenManifest(paths), null, 2)}\n`
    );
    return;
  }
  const root = argument('--artifacts');
  if (!root)
    throw new Error('usage: --artifacts <dir> | --changed <paths.txt>');
  const judgePath = argument('--judge');
  const ledger = auditScreens({
    ...loadArtifacts(root),
    judge: judgePath ? readJson(judgePath) : null,
  });
  const out = argument('--out');
  if (out) writeFileSync(out, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(
    `[screen-audit] ${JSON.stringify(ledger.totals)} (${relative(process.cwd(), root) || root})`
  );
  if (!process.argv.includes('--file')) return;
  const plans = remediationPlans(ledger);
  if (process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true') {
    process.stdout.write(`${JSON.stringify(plans, null, 2)}\n`);
    return;
  }
  const { upsertLinearIssueByTitleFingerprint } = await import(
    '../lib/linear-issue-intake.mjs'
  );
  for (const plan of plans) {
    const result = await upsertLinearIssueByTitleFingerprint({
      ...plan,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    if (!result?.ok)
      throw new Error(
        `${plan.fingerprint}: ${result?.reason || 'linear_upsert_failed'}`
      );
    console.log(`[screen-audit] filed ${plan.fingerprint}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

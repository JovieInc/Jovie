// Contracts for the advisory draft-PR review kernel (docs/evaluations/pr-review-kernel.md).
//
// Pure data contracts: no model, GitHub, or filesystem access. The review job
// produces a `pr-review-receipt/v1`; a separate deterministic publisher reads it.
// Findings are advice. Nothing here can mark a PR blocked or certified.

import { evidenceFingerprint } from '../invariants/run-outcome.mjs';

export const PR_REVIEW_RECEIPT_SCHEMA = 'pr-review-receipt/v1';

/** Finding lifecycle. A human/agent reply is never evidence of a fix. */
export const FINDING_STATES = Object.freeze([
  'candidate',
  'verified',
  'fixed-and-reverified',
  'dismissed-with-evidence',
  'stale',
  'not-assessed',
]);

export const RECEIPT_STATUSES = Object.freeze([
  'complete',
  'incomplete',
  'stale',
]);
export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2']);
export const EVIDENCE_LEVELS = Object.freeze([
  'executable',
  'cross-file-argument',
  'excerpt',
]);
export const REVIEW_TIERS = Object.freeze(['cheap', 'strong']);

/** Jev may see bounded source excerpts for code review only (decision 2026-09-25). */
export const JEV_CODE_REVIEW_EVIDENCE_BASIS = 'source-excerpt';
export const JEV_CODE_EXCERPT_MAX_BYTES = 16_000;

export const MAX_SPECIALISTS = 4;
export const MAX_PUBLISHED_INLINE_FINDINGS = 5;

const BASE_SPECIALIST = 'behavior-contracts';

/**
 * Deterministic minimum review per ci-harness risk rule id
 * (.github/ci-harness/manifest.json `riskRules`). Model advice may raise the
 * tier, never lower it.
 */
export const RISK_REVIEW_FLOORS = Object.freeze({
  'auth-identity': { specialists: ['identity-ownership'], minTier: 'strong' },
  'billing-money': { specialists: ['billing-money'], minTier: 'strong' },
  'db-migrations': { specialists: ['async-state'], minTier: 'strong' },
  'activation-automation-data': {
    specialists: ['async-state', 'identity-ownership'],
    minTier: 'cheap',
  },
  'proxy-middleware': {
    specialists: ['identity-ownership'],
    minTier: 'strong',
  },
  'ci-workflows': { specialists: ['ci-agent-authority'], minTier: 'strong' },
  'agent-control-plane': {
    specialists: ['ci-agent-authority'],
    minTier: 'strong',
  },
  'env-config': { specialists: ['ci-agent-authority'], minTier: 'cheap' },
});

function tierRank(tier) {
  const rank = REVIEW_TIERS.indexOf(tier);
  return rank === -1 ? 0 : rank;
}

/**
 * Select specialists and the effective tier for one PR head.
 * `testsChanged` adds the test-validity specialist.
 */
export function planReview({
  riskRuleIds = [],
  advisedTier = 'cheap',
  testsChanged = false,
} = {}) {
  const specialists = [BASE_SPECIALIST];
  let minTier = 'cheap';
  const forcedBy = [];
  for (const ruleId of [...new Set(riskRuleIds)].sort()) {
    const floor = RISK_REVIEW_FLOORS[ruleId];
    if (!floor) continue;
    for (const specialist of floor.specialists) {
      if (!specialists.includes(specialist)) specialists.push(specialist);
    }
    if (tierRank(floor.minTier) > tierRank(minTier)) minTier = floor.minTier;
    if (floor.minTier === 'strong') forcedBy.push(ruleId);
  }
  if (testsChanged && !specialists.includes('test-validity')) {
    specialists.push('test-validity');
  }
  const tier =
    tierRank(advisedTier) > tierRank(minTier) ? advisedTier : minTier;
  return {
    specialists: specialists.slice(0, MAX_SPECIALISTS),
    droppedSpecialists: specialists.slice(MAX_SPECIALISTS),
    minTier,
    tier,
    forcedBy,
  };
}

/** Stable identity for one root cause across heads, used to dedupe and update comments. */
export function rootCauseId({ ruleId, symbol, consequenceClass }) {
  return evidenceFingerprint({
    ruleId: String(ruleId ?? ''),
    symbol: String(symbol ?? ''),
    consequenceClass: String(consequenceClass ?? ''),
  });
}

const SHA_RE = /^[0-9a-f]{40}$/;
const FINDING_TEXT_FIELDS = ['title', 'trigger', 'consequence', 'repair'];

export function validateFinding(finding) {
  const errors = [];
  if (!finding || typeof finding !== 'object')
    return ['finding must be an object'];
  if (!FINDING_STATES.includes(finding.state)) errors.push('state');
  if (!SEVERITIES.includes(finding.severity)) errors.push('severity');
  if (!EVIDENCE_LEVELS.includes(finding.evidenceLevel))
    errors.push('evidenceLevel');
  if (
    typeof finding.rootCauseId !== 'string' ||
    !finding.rootCauseId.startsWith('sha256:')
  ) {
    errors.push('rootCauseId');
  }
  if (typeof finding.introducedByPr !== 'boolean')
    errors.push('introducedByPr');
  const location = finding.location;
  if (
    !location ||
    typeof location.path !== 'string' ||
    location.path.length === 0 ||
    !Number.isInteger(location.line) ||
    location.line < 1
  ) {
    errors.push('location');
  }
  for (const field of FINDING_TEXT_FIELDS) {
    if (
      typeof finding[field] !== 'string' ||
      finding[field].trim().length === 0
    ) {
      errors.push(field);
    }
  }
  if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
    errors.push('evidence');
  }
  return errors;
}

/**
 * Build the receipt. Budget exhaustion, timeouts and provider errors make it
 * `incomplete`; a head that moved during review makes it `stale`.
 */
export function assembleReceipt({
  pr,
  baseSha,
  headSha,
  liveHeadSha = headSha,
  findings = [],
  coverage = { assessed: [], notAssessed: [] },
  failure = null,
  spend = { usd: 0, capUsd: 0 },
  generatedAt = new Date().toISOString(),
}) {
  if (!Number.isInteger(pr) || pr < 1)
    throw new Error('pr must be a positive integer');
  if (!SHA_RE.test(baseSha ?? '') || !SHA_RE.test(headSha ?? '')) {
    throw new Error('baseSha and headSha must be 40-char lowercase hex');
  }
  const invalid = findings
    .map((finding, index) => ({ index, errors: validateFinding(finding) }))
    .filter(entry => entry.errors.length > 0);
  if (invalid.length > 0) {
    throw new Error(`invalid findings: ${JSON.stringify(invalid)}`);
  }
  let status = 'complete';
  if (liveHeadSha !== headSha) status = 'stale';
  else if (failure) status = 'incomplete';
  return {
    schema: PR_REVIEW_RECEIPT_SCHEMA,
    pr,
    baseSha,
    headSha,
    status,
    failure: failure ? String(failure) : null,
    findings:
      status === 'stale'
        ? findings.map(finding => ({ ...finding, state: 'stale' }))
        : findings,
    coverage: {
      assessed: [...(coverage.assessed ?? [])],
      notAssessed: [...(coverage.notAssessed ?? [])],
    },
    spend,
    shipBlocking: false,
    certified: false,
    generatedAt,
  };
}

/**
 * One-line verdict for the summary comment. Never reports a clean result
 * unless every planned area was assessed.
 */
export function summarizeReceipt(receipt) {
  if (receipt.status === 'stale') return 'stale';
  if (receipt.status === 'incomplete') return 'incomplete';
  if (receipt.findings.some(finding => finding.state === 'verified')) {
    return 'verified-findings';
  }
  if (receipt.coverage.notAssessed.length > 0) return 'partially-assessed';
  return 'no-verified-findings';
}

const SEVERITY_ORDER = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

/**
 * Findings the publisher may post inline for the live head: verified, P0/P1,
 * deduped by root cause, most severe first, capped.
 */
export function selectPublishableFindings(receipt, liveHeadSha) {
  if (receipt.status !== 'complete' && receipt.status !== 'incomplete')
    return [];
  if (liveHeadSha !== receipt.headSha) return [];
  const seen = new Set();
  return receipt.findings
    .filter(
      finding => finding.state === 'verified' && finding.severity !== 'P2'
    )
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .filter(finding => {
      if (seen.has(finding.rootCauseId)) return false;
      seen.add(finding.rootCauseId);
      return true;
    })
    .slice(0, MAX_PUBLISHED_INLINE_FINDINGS);
}

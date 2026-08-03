/**
 * Canonical plan approval boundary for the Jovie backlog control plane.
 *
 * This is intentionally narrower than classification and admission: only a
 * verified, concrete, bounded issue may receive one stable plan-gate/v1
 * evidence comment. All writes are followed by an authoritative Linear reread.
 */

import { createHash } from 'node:crypto';

export const PLAN_GATE_SCHEMA = 'plan-gate/v1';
export const PLAN_GATE_PREFIX = '<!-- plan-gate/v1 -->';
export const PLAN_GATE_SUFFIX = '<!--/plan-gate-->';

const ALLOWED_STATES = new Set(['Triage', 'Backlog', 'Todo']);
const PROTECTED_LABELS = new Set([
  'human-review-required',
  'needs-human',
  'no-auto',
  'protected',
  'tim-approved',
  'tim-owned',
  'synthetic',
]);
const CREDENTIAL_PATTERN =
  /credential|secret|password|api[ -]?key|access token|private key/i;
const SYNTHETIC_PATTERN = /synthetic|bundle|workstream|batch|epic-only/i;
const TIM_PATTERN = /tim(?:\s|-|_)*white|itstimwhite|^tim$/i;

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body || '';
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sorted(value[key])])
    );
  }
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyList(value) {
  return (
    (Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)) ||
    nonEmptyString(value)
  );
}

function isTimOwned(issue) {
  const assignee = issue?.assignee;
  if (!assignee) return false;
  return TIM_PATTERN.test(
    `${assignee.id || ''} ${assignee.name || ''} ${assignee.email || ''} ${assignee.displayName || ''}`
  );
}

function hasActivePullRequest(issue) {
  return Boolean(
    issue?.pullRequestUrl ||
      issue?.pullRequest ||
      issue?.activePullRequest ||
      issue?.pullRequest?.url
  );
}

function issueText(issue) {
  return `${issue?.title || ''} ${issue?.description || ''}`;
}

/** Return a stable reason when a candidate cannot cross the plan boundary. */
export function validatePlanCandidate(issue, evidence) {
  if (!issue?.id || !/^JOV-\d+$/.test(issue.identifier || ''))
    return 'not-concrete-jovie-issue';
  if (!evidence || evidence.verified !== true) return 'evidence-not-verified';
  if (evidence.concrete !== true) return 'evidence-not-concrete';
  if (evidence.bounded !== true) return 'evidence-not-bounded';

  const required = [
    ['repo', evidence.repo],
    ['project', evidence.project],
    ['owner', evidence.owner],
    ['scope', evidence.scope],
    ['acceptance', evidence.acceptance],
    ['test', evidence.test],
    ['rollback', evidence.rollback],
  ];
  const missing = required.find(([name, value]) =>
    ['acceptance', 'test'].includes(name)
      ? !nonEmptyList(value)
      : !nonEmptyString(value)
  );
  if (missing) return `missing-${missing[0]}-evidence`;

  const state = issue.state?.name || issue.state;
  if (!ALLOWED_STATES.has(state)) return 'ambiguous-or-inactive-state';
  if (['Done', 'Canceled', 'Cancelled', 'Closed'].includes(state))
    return 'closed-issue';
  if (isTimOwned(issue)) return 'tim-owned';
  if (labelsOf(issue).some(label => PROTECTED_LABELS.has(label)))
    return 'protected-or-human-review';
  if (
    SYNTHETIC_PATTERN.test(`${labelsOf(issue).join(' ')} ${issueText(issue)}`)
  )
    return 'synthetic-or-ambiguous-work';
  if (CREDENTIAL_PATTERN.test(issueText(issue))) return 'credential-work';
  if (hasActivePullRequest(issue)) return 'active-pull-request';
  if (evidence.synthetic === true || evidence.ambiguous === true)
    return 'synthetic-or-ambiguous-evidence';
  if (evidence.repo !== 'JovieInc/Jovie') return 'repo-not-canonical';
  if (issue.project?.name && issue.project.name !== evidence.project)
    return 'project-mismatch';
  return null;
}

function normalizedEvidence(evidence) {
  return sorted({
    verified: true,
    concrete: true,
    bounded: true,
    repo: evidence.repo.trim(),
    project: evidence.project.trim(),
    owner: evidence.owner.trim(),
    scope: evidence.scope.trim(),
    acceptance: Array.isArray(evidence.acceptance)
      ? evidence.acceptance.map(item => item.trim())
      : [evidence.acceptance.trim()],
    test: Array.isArray(evidence.test)
      ? evidence.test.map(item => item.trim())
      : [evidence.test.trim()],
    rollback: evidence.rollback.trim(),
  });
}

export function planGateFingerprint(issue, evidence) {
  const canonical = JSON.stringify(
    sorted({ issue: issue.identifier, evidence: normalizedEvidence(evidence) })
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function buildPlanGateReceipt(issue, evidence) {
  const payload = {
    schema: PLAN_GATE_SCHEMA,
    issue: issue.identifier,
    fingerprint: planGateFingerprint(issue, evidence),
    evidence: normalizedEvidence(evidence),
  };
  return `${PLAN_GATE_PREFIX}\n${JSON.stringify(payload)}\n${PLAN_GATE_SUFFIX}`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment => commentBody(comment) === receipt);
}

function mutationSucceeded(result) {
  return result?.success === true || result?.commentCreate?.success === true;
}

/**
 * Write exactly one plan receipt, or return an idempotent no-op. The client is
 * injected so this boundary remains unit-testable without touching Linear.
 */
export async function approvePlan({ issue, evidence, client }) {
  const reason = validatePlanCandidate(issue, evidence);
  if (reason) return { status: 'rejected', reason };

  const receipt = buildPlanGateReceipt(issue, evidence);
  if (hasReceipt(issue, receipt)) {
    return {
      status: 'already-approved',
      identifier: issue.identifier,
      fingerprint: planGateFingerprint(issue, evidence),
      receipt,
    };
  }

  const result = await client.addComment(issue.id, receipt);
  if (!mutationSucceeded(result))
    throw new Error('plan-gate-receipt-mutation-failed');

  const reread = await client.fetchIssue(issue.identifier);
  if (!reread || !hasReceipt(reread, receipt))
    throw new Error('plan-gate-receipt-verification-failed');

  return {
    status: 'approved',
    identifier: reread.identifier,
    fingerprint: planGateFingerprint(issue, evidence),
    receipt,
  };
}

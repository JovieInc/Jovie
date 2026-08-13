/**
 * Canonical plan approval boundary for the Jovie backlog control plane.
 *
 * This is intentionally narrower than classification and admission: only a
 * verified, concrete, bounded issue may receive one stable plan-gate/v1
 * evidence comment. All writes are followed by an authoritative Linear reread.
 */

import { createHash } from 'node:crypto';
import { hasProtectedAdmissionLabel } from './admission-policy.mjs';
import { contextGateReceipt } from './context-gate.mjs';
import { researchGateReceipt } from './research-gate.mjs';

export const PLAN_GATE_SCHEMA = 'plan-gate/v1';
export const PLAN_GATE_PREFIX = '<!-- plan-gate/v1 -->';
export const PLAN_GATE_SUFFIX = '<!--/plan-gate-->';
export const PLAN_APPROVED_LABEL = 'plan-approved';

const ALLOWED_STATES = new Set(['Triage', 'Backlog', 'Todo']);
const CREDENTIAL_PATTERN =
  /credential|secret|password|api[ -]?key|access token|private key/i;
const SYNTHETIC_PATTERN = /synthetic|bundle|workstream|batch|epic-only/i;
const TIM_PATTERN = /tim(?:\s|-|_)*white|itstimwhite|^tim$/i;
const REPO_BY_TEAM = Object.freeze({
  JOV: 'JovieInc/Jovie',
  LYB: 'JovieInc/LogYourBody',
});

function canonicalRepoForIssue(issue) {
  const key = /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(issue?.identifier || '')?.[1];
  return REPO_BY_TEAM[String(key || '').toUpperCase()] || null;
}

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
  const canonicalRepo = canonicalRepoForIssue(issue);
  if (!issue?.id || !canonicalRepo) return 'not-concrete-routed-issue';
  if (!evidence || evidence.verified !== true) return 'evidence-not-verified';
  if (evidence.concrete !== true) return 'evidence-not-concrete';
  if (evidence.bounded !== true) return 'evidence-not-bounded';

  const required = [
    ['repo', evidence.repo],
    ['project', evidence.project],
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

  // Ownership roles are explicit and consistent (JOV-5032): Symphony owns
  // implementation through draft PR / In Review; Gem + GitHub own
  // verification, queue, merge, deploy, and production receipts. The
  // ambiguous single `owner` field is intentionally not accepted.
  if (
    evidence.owners?.implementation !== 'Symphony' ||
    evidence.owners?.verification !== 'Gem'
  )
    return 'ownership-roles-invalid';

  const state = issue.state?.name || issue.state;
  if (!ALLOWED_STATES.has(state)) return 'ambiguous-or-inactive-state';
  if (['Done', 'Canceled', 'Cancelled', 'Closed'].includes(state))
    return 'closed-issue';
  if (isTimOwned(issue)) return 'tim-owned';
  if (
    hasProtectedAdmissionLabel(issue) ||
    labelsOf(issue).includes('synthetic')
  )
    return 'protected-or-human-review';
  if (
    SYNTHETIC_PATTERN.test(`${labelsOf(issue).join(' ')} ${issueText(issue)}`)
  )
    return 'synthetic-or-ambiguous-work';
  if (CREDENTIAL_PATTERN.test(issueText(issue))) return 'credential-work';
  if (hasActivePullRequest(issue)) return 'active-pull-request';
  if (evidence.synthetic === true || evidence.ambiguous === true)
    return 'synthetic-or-ambiguous-evidence';
  if (evidence.repo !== canonicalRepo) return 'repo-not-canonical';
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
    owners: {
      implementation: evidence.owners.implementation.trim(),
      verification: evidence.owners.verification.trim(),
    },
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

export function buildPlanGateReceipt(issue, evidence, options = {}) {
  const payload = {
    schema: PLAN_GATE_SCHEMA,
    issue: issue.identifier,
    fingerprint: planGateFingerprint(issue, evidence),
    contextFingerprint:
      contextGateReceipt(issue, options)?.payload?.fingerprint || null,
    researchFingerprint:
      researchGateReceipt(issue, options)?.payload?.fingerprint || null,
    evidence: normalizedEvidence(evidence),
  };
  return `${PLAN_GATE_PREFIX}\n${JSON.stringify(payload)}\n${PLAN_GATE_SUFFIX}`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment => commentBody(comment) === receipt);
}

export function planGateReceipt(issue, options = {}) {
  const body = commentsOf(issue)
    .map(commentBody)
    .find(
      value =>
        value.startsWith(`${PLAN_GATE_PREFIX}\n`) &&
        value.endsWith(`\n${PLAN_GATE_SUFFIX}`)
    );
  if (!body) return null;
  try {
    const payload = JSON.parse(
      body.slice(
        `${PLAN_GATE_PREFIX}\n`.length,
        -`\n${PLAN_GATE_SUFFIX}`.length
      )
    );
    if (
      payload?.schema !== PLAN_GATE_SCHEMA ||
      payload?.issue !== issue?.identifier ||
      !payload?.fingerprint ||
      !payload?.evidence ||
      validatePlanCandidate(issue, payload.evidence) ||
      planGateFingerprint(issue, payload.evidence) !== payload.fingerprint
    )
      return null;
    // The pre-lease fingerprints are required and reconstructed semantically
    // (JOV-5032): a plan receipt with null or mismatched context/research
    // fingerprints — or one whose pre-lease receipts went stale after an
    // issue edit — is not authority for admission or lease.
    const context = contextGateReceipt(issue, options);
    const research = researchGateReceipt(issue, options);
    if (
      !context ||
      !research ||
      payload.contextFingerprint !== context.payload.fingerprint ||
      payload.researchFingerprint !== research.payload.fingerprint
    )
      return null;
    return { body, payload };
  } catch {
    return null;
  }
}

function mutationSucceeded(result) {
  return (
    result?.success === true ||
    result?.commentCreate?.success === true ||
    result?.issueUpdate?.success === true
  );
}

function hasLabel(issue, name) {
  return labelsOf(issue).includes(name.toLowerCase());
}

function labelIds(issue, labelId) {
  return [
    ...new Set([
      ...(issue?.labels?.nodes || []).map(label => label.id).filter(Boolean),
      labelId,
    ]),
  ];
}

/**
 * Write exactly one plan receipt, or return an idempotent no-op. The client is
 * injected so this boundary remains unit-testable without touching Linear.
 * Plan approval is fail-closed on the pre-lease context and research
 * receipts: they are revalidated semantically against the current issue
 * before any plan mutation is written (JOV-5032).
 */
export async function approvePlan({
  issue,
  evidence,
  client,
  teamId = null,
  now = new Date().toISOString(),
}) {
  const reason = validatePlanCandidate(issue, evidence);
  if (reason) return { status: 'rejected', reason };
  if (!contextGateReceipt(issue, { now }))
    return { status: 'rejected', reason: 'context-receipt-missing-or-invalid' };
  if (!researchGateReceipt(issue, { now }))
    return {
      status: 'rejected',
      reason: 'research-receipt-missing-or-invalid',
    };

  const receipt = buildPlanGateReceipt(issue, evidence, { now });
  if (hasReceipt(issue, receipt) && hasLabel(issue, PLAN_APPROVED_LABEL)) {
    return {
      status: 'already-approved',
      identifier: issue.identifier,
      fingerprint: planGateFingerprint(issue, evidence),
      receipt,
    };
  }

  let current = issue;
  let mutated = false;
  if (!hasReceipt(current, receipt)) {
    const result = await client.addComment(current.id, receipt);
    if (!mutationSucceeded(result))
      throw new Error('plan-gate-receipt-mutation-failed');
    mutated = true;
    current = await client.fetchIssue(current.identifier);
    if (!current || !hasReceipt(current, receipt))
      throw new Error('plan-gate-receipt-verification-failed');
  }

  if (!hasLabel(current, PLAN_APPROVED_LABEL)) {
    const label = await client.fetchTeamLabel?.(teamId, PLAN_APPROVED_LABEL);
    if (!label?.id) throw new Error('plan-approved-label-not-found');
    const result = await client.setIssueLabels(
      current.id,
      labelIds(current, label.id)
    );
    if (!mutationSucceeded(result))
      throw new Error('plan-gate-label-mutation-failed');
    mutated = true;
    current = await client.fetchIssue(current.identifier);
    if (!current || !hasLabel(current, PLAN_APPROVED_LABEL))
      throw new Error('plan-gate-label-verification-failed');
  }

  const reread = await client.fetchIssue(current.identifier);
  if (
    !reread ||
    !hasReceipt(reread, receipt) ||
    !hasLabel(reread, PLAN_APPROVED_LABEL)
  )
    throw new Error('plan-gate-final-verification-failed');

  return {
    status: mutated ? 'approved' : 'already-approved',
    identifier: reread.identifier,
    fingerprint: planGateFingerprint(issue, evidence),
    receipt,
  };
}

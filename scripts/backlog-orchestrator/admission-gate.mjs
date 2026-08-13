/** Deterministic approval boundary between a verified plan and Symphony. */

import { createHash } from 'node:crypto';
import { hasProtectedAdmissionLabel } from './admission-policy.mjs';
import { contextGateReceipt } from './context-gate.mjs';
import { PLAN_APPROVED_LABEL, planGateReceipt } from './plan-gate.mjs';
import { researchGateReceipt } from './research-gate.mjs';

export const ADMISSION_GATE_SCHEMA = 'admission-gate/v1';
export const ADMISSION_GATE_PREFIX = '<!-- admission-gate/v1 -->';
export const ADMISSION_GATE_SUFFIX = '<!--/admission-gate-->';
export const ADMISSION_APPROVED_LABEL = 'admission-approved';

const ALLOWED_STATES = new Set(['Triage', 'Backlog', 'Todo']);
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

function hasLabel(issue, label) {
  return labelsOf(issue).includes(label.toLowerCase());
}

function isTimOwned(issue) {
  const assignee = issue?.assignee;
  return Boolean(
    assignee &&
      /tim(?:\s|-|_)*white|itstimwhite|^tim$/i.test(
        `${assignee.id || ''} ${assignee.name || ''} ${assignee.email || ''}`
      )
  );
}

export function validateAdmissionCandidate(
  issue,
  { now = new Date().toISOString() } = {}
) {
  if (!issue?.id || !/^(?:JOV|LYB)-\d+$/.test(issue.identifier || ''))
    return 'not-concrete-routed-issue';
  if (!ALLOWED_STATES.has(issue.state?.name || issue.state))
    return 'ambiguous-or-active-state';
  if (isTimOwned(issue)) return 'tim-owned';
  if (hasProtectedAdmissionLabel(issue)) return 'protected-or-human-review';
  // Pre-lease context and research receipts are revalidated semantically
  // against the current issue and freshness window (JOV-5032).
  if (!contextGateReceipt(issue, { now }))
    return 'context-receipt-missing-or-invalid';
  if (!researchGateReceipt(issue, { now }))
    return 'research-receipt-missing-or-invalid';
  if (!hasLabel(issue, PLAN_APPROVED_LABEL)) return 'plan-label-missing';
  if (!planGateReceipt(issue)) return 'plan-receipt-missing-or-invalid';
  return null;
}

export function admissionGateFingerprint(issue) {
  const plan = planGateReceipt(issue);
  const context = contextGateReceipt(issue);
  const research = researchGateReceipt(issue);
  return createHash('sha256')
    .update(
      `${issue.identifier}|${plan?.payload?.fingerprint || ''}|${context?.payload?.fingerprint || ''}|${research?.payload?.fingerprint || ''}`
    )
    .digest('hex')
    .slice(0, 24);
}

export function buildAdmissionGateReceipt(issue) {
  const plan = planGateReceipt(issue);
  const payload = {
    schema: ADMISSION_GATE_SCHEMA,
    issue: issue.identifier,
    fingerprint: admissionGateFingerprint(issue),
    planFingerprint: plan?.payload?.fingerprint || '',
    contextFingerprint: contextGateReceipt(issue)?.payload?.fingerprint || '',
    researchFingerprint: researchGateReceipt(issue)?.payload?.fingerprint || '',
    decision: 'approved',
  };
  return `${ADMISSION_GATE_PREFIX}\n${JSON.stringify(payload)}\n${ADMISSION_GATE_SUFFIX}`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment => commentBody(comment) === receipt);
}

function mutationSucceeded(result) {
  return (
    result?.success === true ||
    result?.commentCreate?.success === true ||
    result?.issueUpdate?.success === true
  );
}

function labelIds(issue, labelId) {
  return [
    ...new Set([
      ...(issue?.labels?.nodes || []).map(label => label.id).filter(Boolean),
      labelId,
    ]),
  ];
}

export async function approveAdmission({
  issue,
  client,
  teamId = null,
  now = new Date().toISOString(),
}) {
  const reason = validateAdmissionCandidate(issue, { now });
  if (reason) return { status: 'rejected', reason };

  const receipt = buildAdmissionGateReceipt(issue);
  if (hasReceipt(issue, receipt) && hasLabel(issue, ADMISSION_APPROVED_LABEL)) {
    return {
      status: 'already-approved',
      identifier: issue.identifier,
      fingerprint: admissionGateFingerprint(issue),
      receipt,
    };
  }

  let current = issue;
  if (!hasReceipt(current, receipt)) {
    const result = await client.addComment(current.id, receipt);
    if (!mutationSucceeded(result))
      throw new Error('admission-gate-receipt-mutation-failed');
    current = await client.fetchIssue(current.identifier);
    if (!current || !hasReceipt(current, receipt))
      throw new Error('admission-gate-receipt-verification-failed');
  }

  if (!hasLabel(current, ADMISSION_APPROVED_LABEL)) {
    const label = await client.fetchTeamLabel?.(
      teamId,
      ADMISSION_APPROVED_LABEL
    );
    if (!label?.id) throw new Error('admission-approved-label-not-found');
    const result = await client.setIssueLabels(
      current.id,
      labelIds(current, label.id)
    );
    if (!mutationSucceeded(result))
      throw new Error('admission-gate-label-mutation-failed');
    current = await client.fetchIssue(current.identifier);
    if (!current || !hasLabel(current, ADMISSION_APPROVED_LABEL))
      throw new Error('admission-gate-label-verification-failed');
  }

  const reread = await client.fetchIssue(current.identifier);
  if (
    !reread ||
    !hasReceipt(reread, receipt) ||
    !hasLabel(reread, ADMISSION_APPROVED_LABEL) ||
    validateAdmissionCandidate(reread, { now })
  )
    throw new Error('admission-gate-final-verification-failed');

  return {
    status: 'approved',
    identifier: reread.identifier,
    fingerprint: admissionGateFingerprint(reread),
    receipt,
  };
}

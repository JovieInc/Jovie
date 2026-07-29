/**
 * Deterministic admission boundary for Symphony.
 *
 * Workstream bundles are useful reports, but only one concrete JOV issue may
 * cross this boundary. Admission is fail-closed on ownership, plan evidence,
 * and mutation read-back.
 */

import { isProductionRed, scoreIssue } from './scorer.mjs';

export const MAX_CONCURRENT_SHIPPING = 1;
export const SYMPHONY_LABEL = 'symphony';
export const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
export const ADMISSION_RECEIPT_PREFIX = '<!-- symphony-admission:v1 ';

const PROTECTED_LABELS = new Set([
  'human-review-required',
  'needs-human',
  'no-auto',
  'protected',
  'tim-approved',
  'tim-owned',
]);
const PLAN_LABELS = new Set(['plan-approved', 'approved-plan']);
const ADMISSION_LABELS = new Set([
  'admission-approved',
  'symphony-admission-approved',
]);

function namesOf(issueOrClassification) {
  if (Array.isArray(issueOrClassification?.labels))
    return issueOrClassification.labels;
  return (issueOrClassification?.labels?.nodes || []).map(label => label.name);
}

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentText(issue) {
  return commentsOf(issue)
    .map(comment =>
      typeof comment === 'string'
        ? comment
        : `${comment.body || ''} ${comment.event || ''}`
    )
    .join('\n');
}

export function isConcreteJovieIssue(issue) {
  return Boolean(issue?.id && /^JOV-\d+$/.test(issue.identifier || ''));
}

function isTimOwned(issue) {
  const assignee = issue?.assignee;
  if (!assignee) return false;
  const text =
    `${assignee.id || ''} ${assignee.name || ''} ${assignee.email || ''} ${assignee.displayName || ''}`.toLowerCase();
  return /tim(?:\s|-|_)*white|itstimwhite|^tim$/.test(text);
}

export function hasAdmissionEvidence(issue, classification = issue) {
  const labels = new Set([...namesOf(issue), ...namesOf(classification)]);
  const text = commentText(issue).toLowerCase();
  const planApproved =
    [...PLAN_LABELS].some(label => labels.has(label)) ||
    /plan[- ]approved|approved[- ]plan/.test(text);
  const admissionApproved =
    [...ADMISSION_LABELS].some(label => labels.has(label)) ||
    /admission[- ]approved|symphony[- ]admission[- ]approved/.test(text);
  return {
    planApproved,
    admissionApproved,
    eligible: planApproved && admissionApproved,
  };
}

export function buildAdmissionReceipt(
  issue,
  { now = new Date().toISOString(), fingerprint = '' } = {}
) {
  return `${ADMISSION_RECEIPT_PREFIX}${JSON.stringify({ issue: issue.identifier, fingerprint, action: 'lease', at: now })} -->`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment =>
    (comment.body || comment).includes(receipt)
  );
}

function issueForClassification(classification) {
  return classification.issue || classification;
}

function eligibleCandidate(classification, bundledIds) {
  const issue = issueForClassification(classification);
  const evidence = hasAdmissionEvidence(issue, classification);
  const state = issue.state?.name || classification.state;
  return (
    isConcreteJovieIssue(issue) &&
    !bundledIds.has(classification.identifier) &&
    classification.category === 'triageable' &&
    ['Triage', 'Backlog', 'Todo'].includes(state) &&
    !namesOf(issue).some(label => PROTECTED_LABELS.has(label)) &&
    !isTimOwned(issue) &&
    !issue.pullRequestUrl &&
    evidence.eligible
  );
}

/**
 * Select exactly one real, evidence-backed issue. `workstreams` is deliberately
 * not admitted: its member IDs remain report-only.
 */
export async function selectNextToAdmit(
  classifications,
  workstreams,
  state = {}
) {
  const prodRed = state.productionRed ?? (await isProductionRed());
  if (prodRed)
    return { admit: [], reason: 'production is red — blocking admission' };
  if ((state.currentlyShipping || 0) >= MAX_CONCURRENT_SHIPPING) {
    return {
      admit: [],
      reason: `at capacity (${state.currentlyShipping}/${MAX_CONCURRENT_SHIPPING})`,
    };
  }

  const bundledIds = new Set(
    (workstreams || []).flatMap(workstream => workstream.issueIds || [])
  );
  const candidates = classifications
    .filter(classification => eligibleCandidate(classification, bundledIds))
    .map(classification => ({
      ...classification,
      type: 'issue',
      issue: issueForClassification(classification),
      score: scoreIssue(classification).score,
    }))
    .sort(
      (a, b) => b.score - a.score || a.identifier.localeCompare(b.identifier)
    );

  if (candidates.length === 0) {
    return {
      admit: [],
      reason: bundledIds.size
        ? 'no concrete evidence-backed issue (synthetic bundles are report-only)'
        : 'no eligible candidates',
    };
  }
  const selected = candidates[0];
  return {
    admit: [selected],
    reason: `selected: ${selected.identifier} (score ${selected.score})`,
  };
}

function mutationSucceeded(result) {
  return (
    result?.success === true ||
    result?.issueUpdate?.success === true ||
    result?.commentCreate?.success === true
  );
}

function labelIds(issue, symphonyLabelId) {
  return [
    ...new Set([
      ...(issue.labels?.nodes || []).map(label => label.id).filter(Boolean),
      symphonyLabelId,
    ]),
  ];
}

async function rereadOrThrow(client, identifier, predicate, reason) {
  const reread = await client.fetchIssue(identifier);
  if (!reread || !predicate(reread))
    throw new Error(`${reason}-verification-failed`);
  return reread;
}

/**
 * Apply one admission lease. Every mutation is followed by a Linear reread;
 * the stable receipt makes retries no-ops.
 */
export async function admitIssue({
  issue,
  classification = issue,
  client,
  teamId = null,
  todoStateId = TODO_STATE_ID,
  now = new Date().toISOString(),
}) {
  if (!isConcreteJovieIssue(issue))
    return { status: 'rejected', reason: 'not-concrete-jovie-issue' };
  if (!hasAdmissionEvidence(issue, classification).eligible) {
    return { status: 'rejected', reason: 'plan-or-admission-evidence-missing' };
  }
  const receipt = buildAdmissionReceipt(issue, {
    now,
    fingerprint: classification.fingerprint || '',
  });
  if (
    hasReceipt(issue, receipt) ||
    (issue.state?.name === 'Todo' &&
      namesOf(issue).includes(SYMPHONY_LABEL) &&
      commentsOf(issue).some(comment =>
        (comment.body || comment).startsWith(ADMISSION_RECEIPT_PREFIX)
      ))
  ) {
    return { status: 'already-admitted', identifier: issue.identifier };
  }

  let current = issue;
  if (current.state?.name !== 'Todo') {
    const result = await client.transitionIssue(current.id, todoStateId);
    if (!mutationSucceeded(result))
      throw new Error('transition-mutation-failed');
    current = await rereadOrThrow(
      client,
      current.identifier,
      reread => reread.state?.name === 'Todo',
      'state'
    );
  }

  if (!namesOf(current).includes(SYMPHONY_LABEL)) {
    const existing = (current.labels?.nodes || []).find(
      label => label.name === SYMPHONY_LABEL
    );
    const teamLabel =
      existing || (await client.fetchTeamLabel?.(teamId, SYMPHONY_LABEL));
    if (!teamLabel?.id) throw new Error('symphony-label-not-found');
    const result = await client.setIssueLabels(
      current.id,
      labelIds(current, teamLabel.id)
    );
    if (!mutationSucceeded(result)) throw new Error('label-mutation-failed');
    current = await rereadOrThrow(
      client,
      current.identifier,
      reread => namesOf(reread).includes(SYMPHONY_LABEL),
      'label'
    );
  }

  const result = await client.addComment(current.id, receipt);
  if (!mutationSucceeded(result)) throw new Error('receipt-mutation-failed');
  current = await rereadOrThrow(
    client,
    current.identifier,
    reread =>
      commentsOf(reread).some(comment =>
        (comment.body || comment).includes(receipt)
      ),
    'receipt'
  );
  await rereadOrThrow(
    client,
    current.identifier,
    reread =>
      reread.state?.name === 'Todo' &&
      namesOf(reread).includes(SYMPHONY_LABEL) &&
      commentsOf(reread).some(comment =>
        (comment.body || comment).includes(receipt)
      ),
    'admission'
  );
  return { status: 'admitted', identifier: current.identifier, receipt };
}

/** Bind one Summer request to the existing canonical admission pipeline. */

import * as admissionGate from './admission-gate.mjs';
import { contextGateReceipt, issueContentHash } from './context-gate.mjs';
import {
  buildDeterministicPlanEvidence,
  teamRouteForIssue,
  validateDeterministicPlanCandidate,
} from './deterministic-gates.mjs';
import { resolveAdmissionTarget } from './ownership-inventory.mjs';
import * as planGate from './plan-gate.mjs';
import { researchGateReceipt } from './research-gate.mjs';
import {
  shippingDigest,
  shippingTaskProfile,
  validateShippingTask,
} from './summer-shipping-lead-contract.mjs';

export const LYB_REVIEWED_PLAN_SCHEMA = 'lyb-reviewed-plan-review/v1';
export const LYB_REVIEWED_PLAN_DECISION_SCHEMA =
  'lyb-reviewed-plan-decision/v1';
export const LYB_REVIEWED_PLAN_DECISION_PREFIX =
  '<!-- lyb-reviewed-plan-decision/v1 -->';
export const LYB_REVIEWED_PLAN_DECISION_SUFFIX =
  '<!--/lyb-reviewed-plan-decision-->';

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body || '';
}

function labelNames(issue) {
  return new Set(
    (issue?.labels?.nodes || issue?.labels || [])
      .map(label => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean)
  );
}

function mutationSucceeded(result) {
  return (
    result?.success === true ||
    result?.commentCreate?.success === true ||
    result?.issueUpdate?.success === true
  );
}

function namedSection(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const lines = String(description || '').split('\n');
  const header = line => /^#{2,3}\s+(.+?)\s*$/.exec(line)?.[1]?.trim() || null;
  const start = lines.findIndex(line =>
    wanted.has(String(header(line) || '').toLowerCase())
  );
  if (start < 0) return '';
  const end = lines.findIndex(
    (line, index) => index > start && Boolean(header(line))
  );
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

function reviewedLybEvidence(issue, task, now) {
  const reason = validateDeterministicPlanCandidate(issue, {
    now,
    reviewedPlan: true,
  });
  if (reason) return { evidence: null, reason };
  const outcome = namedSection(issue.description, ['Exact outcome']);
  const firstRun = namedSection(issue.description, ['Admission / first run']);
  const closedLoop = namedSection(issue.description, ['Closed-loop contract']);
  const completion = namedSection(issue.description, [
    'Required receipts / completion',
  ]);
  if (![outcome, firstRun, closedLoop, completion].every(Boolean))
    return { evidence: null, reason: 'reviewed-plan-sections-incomplete' };
  const targeting = resolveAdmissionTarget(issue);
  if (targeting.decision !== 'admit')
    return {
      evidence: null,
      reason: targeting.reason || 'no-jovie-artifact',
    };
  return {
    reason: null,
    evidence: {
      verified: true,
      concrete: true,
      bounded: true,
      repo: 'JovieInc/LogYourBody',
      project: issue.project?.name || 'LYB',
      owners: { implementation: 'Symphony', verification: 'Gem' },
      scope: `${firstRun}\n\n${closedLoop}`.slice(0, 1800),
      acceptance: [completion.slice(0, 1800)],
      test: [
        'Verify the reviewed native fixture, test, device, CI, install, rerun, and evidence receipts named by the issue without weakening their gates.',
      ],
      rollback:
        'Stop the bounded approval attempt and revert its issue-scoped receipts; this producer does not dispatch, merge, deploy, purchase, or release.',
      value: {
        authority: 'founder-request',
        decisionId: `reviewed-plan:${task.handoffReceiptId}`,
        rationale: outcome.slice(0, 600),
        expectedBenefit: issue.title,
        validation: completion.slice(0, 600),
        timebox: `${task.createdAt}/${task.expiresAt}`,
        sanity: {
          basis: 'assumption',
          concurrency: task.maximumConcurrent,
          demandPerDay: 1,
          criticalPath: [
            { stage: 'reviewed-plan-to-provider-start', durationMs: 0 },
          ],
          bottleneck: 'reviewed-plan admission producer',
          simplification:
            'reuse signed Shipping Lead and canonical plan/admission gates',
          owner: 'Summer',
        },
      },
      target: targeting.target,
      optimization: {
        kind: 'exception',
        class: 'non-optimizable',
        justification:
          'This reviewed native dogfood and certification run measures and selects a later bounded repair; it does not itself define or promote a user-facing variant.',
      },
    },
  };
}

/** Build the exact accepted-review projection an authenticated LYB task binds. */
export function buildReviewedPlanReview(
  issue,
  { now = new Date().toISOString(), task = null } = {}
) {
  const route = teamRouteForIssue(issue);
  if (route?.key !== 'LYB')
    return {
      review: null,
      evidence: null,
      digest: null,
      reason: 'team-mismatch',
    };
  const context = contextGateReceipt(issue, { now });
  if (!context)
    return {
      review: null,
      evidence: null,
      digest: null,
      reason: 'context-receipt-missing-or-invalid',
    };
  const research = researchGateReceipt(issue, { now });
  if (!research)
    return {
      review: null,
      evidence: null,
      digest: null,
      reason: 'research-receipt-missing-or-invalid',
    };
  const existingPlan = planGate.planGateReceipt(issue, { now });
  let plan = existingPlan
    ? { evidence: existingPlan.payload.evidence, reason: null }
    : buildDeterministicPlanEvidence(issue);
  if (plan.reason && shippingTaskProfile(task)?.approvalOnly)
    plan = reviewedLybEvidence(issue, task, now);
  const reason =
    plan.reason || planGate.validatePlanCandidate(issue, plan.evidence);
  if (reason) return { review: null, evidence: null, digest: null, reason };
  const review = {
    schema: LYB_REVIEWED_PLAN_SCHEMA,
    decision: 'accepted',
    reviewer: 'Gem',
    issue: issue.identifier,
    issueId: issue.id,
    issueRevision: issueContentHash(issue),
    state: issue.state?.name || issue.state,
    repository: route.repo,
    contextFingerprint: context.payload.fingerprint,
    researchFingerprint: research.payload.fingerprint,
    planFingerprint: planGate.planGateFingerprint(issue, plan.evidence),
  };
  return {
    review,
    evidence: plan.evidence,
    digest: shippingDigest(review),
    reason: null,
  };
}

function decisionPayload(task, issue, reviewed, fingerprint = null) {
  const payload = {
    schema: LYB_REVIEWED_PLAN_DECISION_SCHEMA,
    decision: 'accepted',
    issue: issue.identifier,
    issueId: issue.id,
    issueRevision: issueContentHash(issue),
    taskKey: task.taskKey,
    handoffReceiptId: task.handoffReceiptId,
    reviewDigest: reviewed.digest,
    review: reviewed.review,
  };
  return fingerprint ? { ...payload, fingerprint } : payload;
}

export function buildReviewedPlanDecisionReceipt(task, issue, options = {}) {
  const reviewed = buildReviewedPlanReview(issue, { ...options, task });
  if (reviewed.reason) return null;
  const payload = decisionPayload(task, issue, reviewed);
  const fingerprint = shippingDigest(payload);
  return `${LYB_REVIEWED_PLAN_DECISION_PREFIX}\n${JSON.stringify({
    ...payload,
    fingerprint,
  })}\n${LYB_REVIEWED_PLAN_DECISION_SUFFIX}`;
}

export function reviewedPlanDecisionReceipt(issue, options = {}) {
  const body = commentsOf(issue)
    .map(commentBody)
    .findLast(
      value =>
        value.startsWith(`${LYB_REVIEWED_PLAN_DECISION_PREFIX}\n`) &&
        value.endsWith(`\n${LYB_REVIEWED_PLAN_DECISION_SUFFIX}`)
    );
  if (!body) return null;
  try {
    const payload = JSON.parse(
      body.slice(
        `${LYB_REVIEWED_PLAN_DECISION_PREFIX}\n`.length,
        -`\n${LYB_REVIEWED_PLAN_DECISION_SUFFIX}`.length
      )
    );
    const reviewed = buildReviewedPlanReview(issue, options);
    if (
      reviewed.reason ||
      payload?.schema !== LYB_REVIEWED_PLAN_DECISION_SCHEMA ||
      payload?.decision !== 'accepted' ||
      payload?.issue !== issue?.identifier ||
      payload?.issueId !== issue?.id ||
      payload?.issueRevision !== issueContentHash(issue) ||
      payload?.reviewDigest !== reviewed.digest ||
      shippingDigest(payload.review) !== reviewed.digest ||
      JSON.stringify(payload.review) !== JSON.stringify(reviewed.review) ||
      shippingDigest(decisionPayload(payload, issue, reviewed)) !==
        payload.fingerprint
    )
      return null;
    return { body, payload };
  } catch {
    return null;
  }
}

function reviewedPlanComplete(issue, options) {
  const labels = labelNames(issue);
  return Boolean(
    labels.has(planGate.PLAN_APPROVED_LABEL) &&
      labels.has(admissionGate.ADMISSION_APPROVED_LABEL) &&
      planGate.planGateReceipt(issue, options) &&
      admissionGate.admissionGateReceipt(issue, options)
  );
}

/** Materialize only reviewed plan/admission evidence; upstream owns dispatch. */
export async function materializeReviewedPlanAdmission({
  task,
  issue,
  client,
  teamId = null,
  now = new Date().toISOString(),
}) {
  validateShippingTask(task);
  const profile = shippingTaskProfile(task);
  if (!profile?.approvalOnly) {
    return { status: 'rejected', reason: 'reviewed-plan-task-required' };
  }
  if (
    issue?.id !== task.issue.id ||
    issue?.identifier !== task.issue.identifier ||
    issue?.updatedAt !== task.issue.revision ||
    (issue?.state?.name || issue?.state) !== profile.state ||
    teamRouteForIssue(issue)?.repo !== profile.repository
  )
    return { status: 'rejected', reason: 'reviewed-plan-issue-mismatch' };
  const existing = reviewedPlanDecisionReceipt(issue, { now, task });
  if (existing) {
    if (
      existing.payload.taskKey !== task.taskKey ||
      existing.payload.handoffReceiptId !== task.handoffReceiptId
    )
      return { status: 'rejected', reason: 'reviewed-plan-decision-conflict' };
    if (reviewedPlanComplete(issue, { now }))
      return { status: 'rejected', reason: 'reviewed-plan-task-replayed' };
  }

  const reviewed = buildReviewedPlanReview(issue, { now, task });
  if (reviewed.reason) return { status: 'rejected', reason: reviewed.reason };
  if (
    task.selected.sourceDigest !== reviewed.digest ||
    task.source.snapshotDigest !== reviewed.digest
  )
    return { status: 'rejected', reason: 'reviewed-plan-digest-mismatch' };

  let current = issue;
  const receipt = buildReviewedPlanDecisionReceipt(task, current, { now });
  if (!receipt)
    return { status: 'rejected', reason: 'reviewed-plan-incomplete' };
  if (!existing) {
    const result = await client.addComment(current.id, receipt);
    if (!mutationSucceeded(result))
      throw new Error('reviewed-plan-decision-mutation-failed');
    current = await client.fetchIssue(current.identifier);
    const written = reviewedPlanDecisionReceipt(current, { now, task });
    if (!written || written.payload.taskKey !== task.taskKey)
      throw new Error('reviewed-plan-decision-verification-failed');
  }

  const planResult = await planGate.approvePlan({
    issue: current,
    evidence: reviewed.evidence,
    client,
    teamId,
    now,
  });
  if (planResult.status === 'rejected') return planResult;
  current = await client.fetchIssue(current.identifier);

  const admissionResult = await admissionGate.approveAdmission({
    issue: current,
    client,
    teamId,
    now,
  });
  if (admissionResult.status === 'rejected') return admissionResult;
  current = await client.fetchIssue(current.identifier);
  const finalDecision = reviewedPlanDecisionReceipt(current, { now, task });
  if (
    !finalDecision ||
    finalDecision.payload.taskKey !== task.taskKey ||
    !reviewedPlanComplete(current, { now }) ||
    (current.state?.name || current.state) !== profile.state
  )
    throw new Error('reviewed-plan-final-verification-failed');

  return {
    status: 'approved',
    issue: current.identifier,
    decisionFingerprint: finalDecision.payload.fingerprint,
    reviewDigest: reviewed.digest,
    planGate: planResult.status,
    admissionGate: admissionResult.status,
    dispatch: 'upstream-owned',
  };
}

/**
 * Admission is not owner execution acceptance or a terminal outcome. The caller
 * must durably record mutation intent before invoking any canonical mutation.
 */
export async function gateShippingLeadRequest(
  task,
  {
    client,
    preflight,
    evaluate,
    team,
    beforeMutation = null,
    dryRun = false,
    now = Date.now,
  }
) {
  validateShippingTask(task);
  const profile = shippingTaskProfile(task);
  const held = reason => ({ status: 'held', reason });
  if (!profile || team?.key !== profile.teamKey)
    return held('shipping-lead-team-mismatch');
  if (!dryRun && typeof beforeMutation !== 'function')
    return held('shipping-lead-mutation-journal-unavailable');
  const fresh = () =>
    Date.parse(task.createdAt) <= now() + 60_000 &&
    Date.parse(task.expiresAt) > now();
  if (!fresh()) return held('shipping-lead-request-expired-or-future');
  const issue = await client.fetchIssue(task.issue.identifier);
  if (
    issue?.id !== task.issue.id ||
    issue?.identifier !== task.issue.identifier ||
    issue?.updatedAt !== task.issue.revision ||
    issue?.state?.name !== profile.state ||
    issue?.assignee !== null
  )
    return held('shipping-lead-issue-changed-or-owned');
  const contentHash = issueContentHash(issue);
  let transitioned = false;
  const recheck = async () => {
    if (!fresh()) throw new Error('shipping-lead-request-expired-or-future');
    const current = await client.fetchIssue(task.issue.identifier);
    if (
      current?.id !== task.issue.id ||
      current?.identifier !== task.issue.identifier ||
      current?.assignee !== null ||
      issueContentHash(current) !== contentHash ||
      current?.state?.name !== (transitioned ? 'Todo' : profile.state)
    )
      throw new Error('shipping-lead-issue-changed-or-owned');
    return current;
  };
  const capacity = async () => {
    const current = await recheck();
    const result = await preflight(team, current, {
      excludeIssueId: transitioned ? task.issue.id : null,
    });
    // Preserve the existing measured fleet/lane capacity; three is an extra cap.
    if (
      !result?.open ||
      !Number.isInteger(result.load?.count) ||
      result.load.count >= profile.maximumConcurrent
    )
      throw new Error(result?.reason || 'shipping-lead-capacity-unavailable');
    return result;
  };
  let first;
  try {
    first = await capacity();
  } catch (error) {
    return held(error.message);
  }
  const mutate = async (method, id, value) => {
    if (dryRun) throw new Error('shipping-lead-dry-run-mutation');
    if (
      id !== task.issue.id ||
      (method === 'transitionIssue' &&
        (profile.approvalOnly || value !== team.todoStateId))
    )
      throw new Error('shipping-lead-mutation-target-mismatch');
    await capacity();
    await beforeMutation({ taskKey: task.taskKey, method, issueId: id });
    // Re-read after persistence too; a concurrent owner may have acquired it.
    await recheck();
    const result = await client[method](id, value);
    if (
      method === 'transitionIssue' &&
      (result?.success || result?.issueUpdate?.success)
    )
      transitioned = true;
    return result;
  };
  const boundedClient = {
    ...client,
    addComment: (id, body) => mutate('addComment', id, body),
    setIssueLabels: (id, labels) => mutate('setIssueLabels', id, labels),
    transitionIssue: (id, state) => mutate('transitionIssue', id, state),
  };
  return evaluate(team, issue, dryRun, first, null, {
    client: boundedClient,
    fingerprint: task.taskKey,
    preflight: capacity,
  });
}

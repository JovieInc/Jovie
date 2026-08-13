/**
 * Deterministic admission boundary for Symphony.
 *
 * Workstream bundles are useful reports, but only a bounded number of concrete
 * issues per routed product team may cross this boundary. Admission is
 * fail-closed on ownership, plan evidence, and mutation read-back.
 */

import { scoreIssue } from './scorer.mjs';
import { parseRoutingReceipt } from './symphony-routing.mjs';

export const MAX_CONCURRENT_SHIPPING = 1;
const MAX_CONCURRENT_SHIPPING_BY_TEAM = Object.freeze({ JOV: 2, LYB: 1 });
export const SYMPHONY_LABEL = 'symphony';
export const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
export const ADMISSION_RECEIPT_PREFIX = '<!-- symphony-admission:v1 ';
export const FLEET_GATE_SCHEMA = 'jovie-fleet-gate/v1';
export const GEM_CONCURRENCY_EVIDENCE_SCHEMA = 'gem-concurrency-evidence/v1';
export const FLEET_GATE_STATE = Object.freeze({
  GREEN: 'GREEN',
  AMBER: 'AMBER',
  RED: 'RED',
});
export const FLEET_GATE_REASON = Object.freeze({
  MAIN_NOT_GREEN: 'main-not-green',
  MAIN_UNKNOWN: 'main-unknown',
  PRODUCTION_NOT_GREEN: 'production-not-green',
  PRODUCTION_DEPLOYMENT_UNBOUND: 'production-deployment-unbound',
  PRODUCTION_UNKNOWN: 'production-unknown',
  CONTROLLER_FAILURE: 'controller-failure',
  CONTROLLER_UNKNOWN: 'controller-unknown',
  CONTROLLER_STALE: 'controller-stale',
  QUEUE_UNKNOWN: 'queue-unknown',
  QUEUE_ABOVE_TARGET: 'queue-above-target',
  CREDENTIAL_COMPROMISE: 'credential-compromise',
  UNSAFE_MIGRATION: 'unsafe-migration-or-data-corruption',
  BROKEN_ISOLATION: 'broken-worktree-isolation',
  REPOSITORY_CORRUPTION: 'repository-or-artifact-corruption',
  SEVERE_INTEGRITY_INCIDENT: 'severe-integrity-incident',
  INVALID_INTEGRITY_RECEIPT: 'invalid-integrity-receipt',
});

const SEVERE_INTEGRITY_REASONS = new Set([
  FLEET_GATE_REASON.CREDENTIAL_COMPROMISE,
  FLEET_GATE_REASON.UNSAFE_MIGRATION,
  FLEET_GATE_REASON.BROKEN_ISOLATION,
  FLEET_GATE_REASON.REPOSITORY_CORRUPTION,
  FLEET_GATE_REASON.SEVERE_INTEGRITY_INCIDENT,
]);
const DEFAULT_GEM_CONCURRENCY = 4;
const MAX_EVIDENCE_BACKED_GEM_CONCURRENCY = 8;
const CONTROLLER_RECEIPT_MAX_AGE_MS = 10 * 60 * 1000;
const CONCURRENCY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function typedReason(code, layer, severity, detail) {
  return { code, layer, severity, detail };
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

function validCommitSha(value, { exact = false } = {}) {
  return (
    typeof value === 'string' &&
    (exact ? value.length === 40 : value.length >= 7 && value.length <= 40) &&
    /^[0-9a-f]+$/.test(value)
  );
}

function deploymentBound(mainSha, deployedSha) {
  return (
    validCommitSha(mainSha, { exact: true }) &&
    validCommitSha(deployedSha, { exact: true }) &&
    mainSha === deployedSha
  );
}

/**
 * Gem stays at four workers by default. Eight is accepted only from a recent,
 * explicit evidence receipt with enough clean observations and no severe
 * incidents. Missing, malformed, or stale evidence fails closed to four.
 */
export function resolveGemConcurrency(
  evidence,
  {
    now = new Date().toISOString(),
    maxAgeMs = CONCURRENCY_EVIDENCE_MAX_AGE_MS,
  } = {}
) {
  const nowMs = Date.parse(now);
  const eligibleForEight =
    evidence?.schema === GEM_CONCURRENCY_EVIDENCE_SCHEMA &&
    evidence?.target === MAX_EVIDENCE_BACKED_GEM_CONCURRENCY &&
    evidence?.approved === true &&
    Number.isInteger(evidence?.cleanRuns) &&
    evidence.cleanRuns >= 20 &&
    evidence?.severeIncidents === 0 &&
    isFreshTimestamp(evidence?.observedAt, nowMs, maxAgeMs);

  return {
    maxConcurrent: eligibleForEight
      ? MAX_EVIDENCE_BACKED_GEM_CONCURRENCY
      : DEFAULT_GEM_CONCURRENCY,
    evidenceAccepted: eligibleForEight,
    reason: eligibleForEight
      ? 'recent-approved-clean-run-evidence'
      : 'default-four-until-eight-is-proven',
  };
}

/**
 * Work admission and promotion admission are intentionally independent.
 * Ordinary main/controller failures are AMBER: isolated draft work continues,
 * while ready/merge/deploy remains frozen. Only an explicit severe integrity
 * incident is RED and blocks new pickup as well.
 */
export function evaluateFleetGate(
  evidence = {},
  {
    now = new Date().toISOString(),
    controllerMaxAgeMs = CONTROLLER_RECEIPT_MAX_AGE_MS,
  } = {}
) {
  const nowMs = Date.parse(now);
  const reasons = [];
  const mainStatus = evidence?.main?.status || 'unknown';
  const productionStatus = evidence?.production?.status || 'unknown';
  const productionUnbound =
    mainStatus === 'green' &&
    productionStatus === 'green' &&
    !deploymentBound(evidence?.main?.sha, evidence?.production?.deployedSha);
  const controllerStatus = evidence?.controller?.status || 'unknown';
  const integrityStatus = evidence?.integrity?.status;
  const integrityReason = evidence?.integrity?.reason;
  const controllerReceiptPresent = Boolean(evidence?.observedAt);
  const controllerFresh =
    controllerReceiptPresent &&
    isFreshTimestamp(evidence.observedAt, nowMs, controllerMaxAgeMs);

  if (
    integrityStatus === 'active' &&
    SEVERE_INTEGRITY_REASONS.has(integrityReason)
  ) {
    reasons.push(
      typedReason(
        integrityReason,
        'integrity',
        'critical',
        evidence?.integrity?.detail || 'Severe integrity incident is active.'
      )
    );
  } else if (integrityStatus !== 'clear' && integrityStatus !== 'resolved') {
    reasons.push(
      typedReason(
        FLEET_GATE_REASON.INVALID_INTEGRITY_RECEIPT,
        'integrity',
        'critical',
        'Integrity state is malformed or not explicitly classified.'
      )
    );
  }

  const redReasons = reasons.filter(reason => reason.severity === 'critical');
  if (redReasons.length === 0) {
    if (!controllerFresh) {
      reasons.push(
        typedReason(
          controllerReceiptPresent
            ? FLEET_GATE_REASON.CONTROLLER_STALE
            : FLEET_GATE_REASON.CONTROLLER_UNKNOWN,
          'controller',
          'warning',
          controllerReceiptPresent
            ? 'Controller receipt is stale; promotion is frozen until refreshed.'
            : 'Controller receipt is unavailable; promotion is frozen until observed.'
        )
      );
    } else if (controllerStatus !== 'green') {
      reasons.push(
        typedReason(
          controllerStatus === 'failed'
            ? FLEET_GATE_REASON.CONTROLLER_FAILURE
            : FLEET_GATE_REASON.CONTROLLER_UNKNOWN,
          'controller',
          'warning',
          'Controller is not green; isolated draft work remains permitted.'
        )
      );
    }

    if (mainStatus === 'red') {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.MAIN_NOT_GREEN,
          'promotion',
          'warning',
          'Main is not green; ready, merge, deploy, and promotion are frozen.'
        )
      );
    } else if (mainStatus !== 'green') {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.MAIN_UNKNOWN,
          'promotion',
          'warning',
          'Main status is unknown; ready, merge, deploy, and promotion are frozen.'
        )
      );
    }

    if (productionStatus === 'red') {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.PRODUCTION_NOT_GREEN,
          'promotion',
          'warning',
          'Production is not green; deployments and production promotion are frozen.'
        )
      );
    } else if (productionStatus !== 'green') {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.PRODUCTION_UNKNOWN,
          'promotion',
          'warning',
          'Production status is unknown; promotion is frozen.'
        )
      );
    }
    if (productionUnbound) {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.PRODUCTION_DEPLOYMENT_UNBOUND,
          'promotion',
          'warning',
          'Production health is not bound to the exact deployed main SHA; promotion and new issue pickup are frozen.'
        )
      );
    }

    const queueStatus = evidence?.queue?.status || 'unknown';
    const eligiblePrs = evidence?.queue?.eligiblePrs;
    const queueTarget = evidence?.queue?.target;
    const queueShapeValid =
      queueStatus === 'known' &&
      Number.isInteger(eligiblePrs) &&
      eligiblePrs >= 0 &&
      Number.isInteger(queueTarget) &&
      queueTarget >= 0;

    if (!queueShapeValid) {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.QUEUE_UNKNOWN,
          'promotion',
          'warning',
          'Promotion queue state is missing, unknown, or malformed.'
        )
      );
    } else if (eligiblePrs > queueTarget) {
      reasons.push(
        typedReason(
          FLEET_GATE_REASON.QUEUE_ABOVE_TARGET,
          'promotion',
          'warning',
          'Promotion queue is above its target.'
        )
      );
    }
  }

  const state = redReasons.length
    ? FLEET_GATE_STATE.RED
    : reasons.length
      ? FLEET_GATE_STATE.AMBER
      : FLEET_GATE_STATE.GREEN;
  const concurrency = resolveGemConcurrency(evidence.concurrencyEvidence, {
    now,
  });
  const queueStatus = evidence?.queue?.status || 'unknown';
  const eligiblePrs = evidence?.queue?.eligiblePrs;
  const queueTarget = evidence?.queue?.target;
  const queueHealthy =
    queueStatus === 'known' &&
    Number.isInteger(eligiblePrs) &&
    eligiblePrs >= 0 &&
    Number.isInteger(queueTarget) &&
    queueTarget >= 0 &&
    eligiblePrs <= queueTarget;
  const isolatedPromotionAllowed =
    state === FLEET_GATE_STATE.AMBER &&
    controllerFresh &&
    controllerStatus === 'green' &&
    mainStatus === 'green' &&
    productionStatus === 'red' &&
    ['clear', 'resolved'].includes(integrityStatus) &&
    queueHealthy &&
    reasons.every(
      reason => reason.code === FLEET_GATE_REASON.PRODUCTION_NOT_GREEN
    );
  const sourceHealthRed =
    mainStatus !== 'green' || productionStatus !== 'green' || productionUnbound;
  const workActivities =
    state === FLEET_GATE_STATE.RED
      ? []
      : [
          ...(sourceHealthRed ? [] : ['approved-issue-lease']),
          'isolated-implementation',
          'tests',
          'review',
          'draft-pr',
        ];

  return {
    schema: FLEET_GATE_SCHEMA,
    observedAt: evidence.observedAt || null,
    evaluatedAt: now,
    state,
    reasons,
    workAdmission: {
      allowed: state !== FLEET_GATE_STATE.RED,
      activities: workActivities,
      newIssueLeaseAllowed: workActivities.includes('approved-issue-lease'),
    },
    promotionAdmission: {
      allowed: state === FLEET_GATE_STATE.GREEN,
      activities:
        state === FLEET_GATE_STATE.GREEN ? ['ready-for-merge', 'merge'] : [],
    },
    isolatedPromotionAdmission: {
      allowed: isolatedPromotionAllowed,
      activities: isolatedPromotionAllowed
        ? ['ready-for-merge', 'native-merge-queue', 'merge']
        : [],
      deploymentsAllowed: false,
      scope: 'exact-head-semantically-isolated-ui-docs',
      maxConcurrent: 1,
      authority: 'canonical-merge-queue-controller',
    },
    ownership: {
      controller: 'Gem',
      implementation: 'Symphony',
      directGemPickup: false,
    },
    concurrency: {
      gem: concurrency,
      symphonyImplementation: 1,
    },
  };
}

export function maxConcurrentShippingForTeam(teamKey, env = process.env) {
  const key = String(teamKey || '').toUpperCase();
  const configured = Number.parseInt(
    env[`SYMPHONY_MAX_CONCURRENT_SHIPPING_${key}`] || '',
    10
  );
  if (Number.isInteger(configured) && configured > 0 && configured <= 8)
    return configured;
  return MAX_CONCURRENT_SHIPPING_BY_TEAM[key] || MAX_CONCURRENT_SHIPPING;
}

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
  return Boolean(issue?.id && /^(?:JOV|LYB)-\d+$/.test(issue.identifier || ''));
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
  const maxConcurrentShipping =
    state.maxConcurrentShipping || MAX_CONCURRENT_SHIPPING;
  const fleetGate = state.fleetGate;
  if (!fleetGate)
    return {
      admit: [],
      reason: 'fleet gate unavailable — blocking new issue pickup',
      fleetGate: null,
    };
  if (
    !fleetGate.workAdmission.allowed ||
    !fleetGate.workAdmission.activities.includes('approved-issue-lease')
  )
    return {
      admit: [],
      reason: `fleet gate ${fleetGate.state.toLowerCase()} — blocking new issue pickup`,
      fleetGate,
    };
  if ((state.currentlyShipping || 0) >= maxConcurrentShipping) {
    return {
      admit: [],
      reason: `at capacity (${state.currentlyShipping}/${maxConcurrentShipping})`,
      fleetGate,
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
    fleetGate,
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
    return { status: 'rejected', reason: 'not-concrete-routed-issue' };
  if (!hasAdmissionEvidence(issue, classification).eligible) {
    return { status: 'rejected', reason: 'plan-or-admission-evidence-missing' };
  }
  const routing = parseRoutingReceipt(issue);
  if (!routing)
    return { status: 'rejected', reason: 'routing-receipt-missing-or-invalid' };
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

/**
 * Deterministic admission boundary for Symphony.
 * Invariant consumers: JOV-INV-007, JOV-INV-008, and JOV-INV-011.
 *
 * Workstream bundles are useful reports, but only a bounded number of concrete
 * issues per routed product team may cross this boundary. Admission is
 * fail-closed on ownership, plan evidence, and mutation read-back.
 */

import { invariantPolicy } from '../invariants/registry.mjs';
import { admissionGateReceipt } from './admission-gate.mjs';
import { preAdmissionDecision } from './admission-policy.mjs';
import { contextGateReceipt } from './context-gate.mjs';
import { planGateReceipt } from './plan-gate.mjs';
import { researchGateReceipt } from './research-gate.mjs';
import { scoreIssue } from './scorer.mjs';
import { verifyRoutingReceipt } from './symphony-routing.mjs';

export const SYMPHONY_LABEL = 'symphony';
export const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
export const ADMISSION_RECEIPT_PREFIX = '<!-- symphony-admission:v1 ';
export const FLEET_GATE_SCHEMA = 'jovie-fleet-gate/v1';
export const GEM_CONCURRENCY_EVIDENCE_SCHEMA = 'gem-concurrency-evidence/v1';
// JOV-INV-007: live measurement emitted by gem-priority-gate.py at evaluation
// time (provider accounts + Symphony runtime + host pressure + integrity).
// Bounded to the canon baseline; only the approved clean-run receipt exceeds it.
export const GEM_MEASURED_CAPACITY_SCHEMA = 'gem-measured-capacity/v1';
export const INDEPENDENT_REVIEW_RECEIPT_SCHEMA = 'jovie-independent-review/v1';
export const INDEPENDENT_REVIEW_AUTHORITY = 'Gem';
export const INDEPENDENT_REVIEWER = 'Gem';
export const INDEPENDENT_REVIEW_SCOPE = 'exact-main-head';
export const CLOSURE_HEALTH_SCHEMA = 'jovie-closure-health/v1';
export const CLOSURE_HEALTH_AUTHORITY = 'Summer';
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
  INDEPENDENT_REVIEW_MISSING: 'independent-review-receipt-missing',
  INDEPENDENT_REVIEW_MALFORMED: 'independent-review-receipt-malformed',
  INDEPENDENT_REVIEW_STALE: 'independent-review-receipt-stale',
  INDEPENDENT_REVIEW_FUTURE: 'independent-review-receipt-future',
  INDEPENDENT_REVIEW_HEAD_MISMATCH: 'independent-review-head-mismatch',
});

const SEVERE_INTEGRITY_REASONS = new Set([
  FLEET_GATE_REASON.CREDENTIAL_COMPROMISE,
  FLEET_GATE_REASON.UNSAFE_MIGRATION,
  FLEET_GATE_REASON.BROKEN_ISOLATION,
  FLEET_GATE_REASON.REPOSITORY_CORRUPTION,
  FLEET_GATE_REASON.SEVERE_INTEGRITY_INCIDENT,
]);
const CAPACITY_POLICY = invariantPolicy('JOV-INV-007');
const FLEET_AUTHORITY = invariantPolicy('JOV-INV-008');
const DEFAULT_GEM_CONCURRENCY = CAPACITY_POLICY.baseline;
const MAX_EVIDENCE_BACKED_GEM_CONCURRENCY = CAPACITY_POLICY.maximum;
const CONTROLLER_RECEIPT_MAX_AGE_MS = 10 * 60 * 1000;
const CONCURRENCY_EVIDENCE_MAX_AGE_MS =
  CAPACITY_POLICY.freshnessHours * 60 * 60 * 1000;
export const FLEET_PROMOTION_MODE = Object.freeze({
  NORMAL: 'normal',
  ISOLATED_ONLY: 'isolated-only',
  DRAFT_ONLY: 'draft-only',
  HOLD_INTAKE: 'hold-intake',
  BLOCKED: 'blocked',
});

function alreadyAdmittedCohortSemantics(promotionMode) {
  if (promotionMode === FLEET_PROMOTION_MODE.HOLD_INTAKE) {
    return {
      preserve: true,
      newIntakeAllowed: true,
      semantics: 'preserve-cohort-and-continue-isolated-implementation',
    };
  }
  if (promotionMode === FLEET_PROMOTION_MODE.BLOCKED) {
    return {
      preserve: false,
      newIntakeAllowed: false,
      semantics: 'dequeue-until-exact-production-recovers',
    };
  }
  if (promotionMode === FLEET_PROMOTION_MODE.ISOLATED_ONLY) {
    return {
      preserve: false,
      newIntakeAllowed: true,
      semantics: 'isolated-only',
    };
  }
  if (promotionMode === FLEET_PROMOTION_MODE.DRAFT_ONLY) {
    return {
      preserve: false,
      newIntakeAllowed: false,
      semantics: 'draft-only',
    };
  }
  return {
    preserve: true,
    newIntakeAllowed: true,
    semantics: 'normal',
  };
}

function typedReason(code, layer, severity, detail) {
  return { code, layer, severity, detail };
}

function evaluateClosureAdmission(candidate) {
  const valid =
    candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    candidate.schema === CLOSURE_HEALTH_SCHEMA &&
    candidate.authority === CLOSURE_HEALTH_AUTHORITY &&
    ['healthy', 'grace', 'red'].includes(candidate.status) &&
    typeof candidate.newIssueIntakeAllowed === 'boolean' &&
    candidate.newIssueIntakeAllowed === (candidate.status === 'healthy') &&
    candidate.promotionContinues === true &&
    candidate.remediationContinues === true &&
    Array.isArray(candidate.reasons) &&
    candidate.reasons.every(reason => typeof reason === 'string');
  const allowed = Boolean(valid && candidate.newIssueIntakeAllowed === true);
  return {
    allowed,
    newIssueIntakeAllowed: allowed,
    newImplementationAllowed: allowed,
    fallbackPrGenerationAllowed: allowed,
    authority: CLOSURE_HEALTH_AUTHORITY,
    status: valid ? candidate.status : 'red',
    reasons: valid
      ? [...candidate.reasons]
      : ['closure-health-receipt-missing-or-malformed'],
    promotionContinues: true,
    remediationContinues: true,
  };
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

function reviewReceiptFields(candidate) {
  return {
    schema: candidate?.schema ?? null,
    status: candidate?.status ?? null,
    authority: candidate?.authority ?? null,
    reviewer: candidate?.reviewer ?? null,
    reviewId: candidate?.reviewId ?? null,
    headSha: candidate?.headSha ?? null,
    scope: candidate?.scope ?? null,
    observedAt: candidate?.observedAt ?? null,
  };
}

/**
 * Validate the independent verification receipt used by normal admission.
 *
 * This is deliberately separate from GitHub review state: the receipt names
 * the authority, the exact current-main head, and its bounded observation
 * window. A caller may not turn a boolean or a stale review into admission.
 *
 * @param {unknown} candidate
 * @param {{ expectedHeadSha?: string, now?: string, maxAgeMs?: number }} [options]
 */
export function validateIndependentReviewReceipt(
  candidate,
  {
    expectedHeadSha,
    now = new Date().toISOString(),
    maxAgeMs = CONTROLLER_RECEIPT_MAX_AGE_MS,
  } = {}
) {
  const fields = reviewReceiptFields(candidate);
  const errors = [];
  const malformed = reason => ({
    ok: false,
    errors: [...errors, reason],
    receipt: null,
  });

  if (candidate == null) {
    return { ok: false, errors: ['receipt is missing'], receipt: null };
  }
  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    return malformed('receipt must be an object');
  }
  if (fields.schema !== INDEPENDENT_REVIEW_RECEIPT_SCHEMA) {
    errors.push(`schema must be ${INDEPENDENT_REVIEW_RECEIPT_SCHEMA}`);
  }
  if (fields.status !== 'passed') errors.push('status must be passed');
  if (fields.authority !== INDEPENDENT_REVIEW_AUTHORITY) {
    errors.push(`authority must be ${INDEPENDENT_REVIEW_AUTHORITY}`);
  }
  if (fields.reviewer !== INDEPENDENT_REVIEWER) {
    errors.push(`reviewer must be ${INDEPENDENT_REVIEWER}`);
  }
  if (typeof fields.reviewId !== 'string' || fields.reviewId.length === 0) {
    errors.push('reviewId must be a non-empty string');
  }
  if (fields.scope !== INDEPENDENT_REVIEW_SCOPE) {
    errors.push(`scope must be ${INDEPENDENT_REVIEW_SCOPE}`);
  }
  const headShaValid = validCommitSha(fields.headSha, { exact: true });
  const expectedHeadValid = validCommitSha(expectedHeadSha, { exact: true });
  if (!headShaValid) {
    errors.push('headSha must be an exact lowercase SHA');
  }
  if (!expectedHeadValid) {
    errors.push('expected main head must be an exact lowercase SHA');
  } else if (headShaValid && fields.headSha !== expectedHeadSha) {
    return {
      ok: false,
      errors: ['review head does not match current main head'],
      receipt: null,
    };
  }
  const observedMs = Date.parse(String(fields.observedAt ?? ''));
  const nowMs = Date.parse(String(now ?? ''));
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) {
    errors.push('observedAt and now must be valid timestamps');
  } else if (observedMs > nowMs) {
    return {
      ok: false,
      errors: ['review receipt is from the future'],
      receipt: null,
    };
  } else if (!isFreshTimestamp(fields.observedAt, nowMs, maxAgeMs)) {
    return {
      ok: false,
      errors: ['review receipt is stale'],
      receipt: null,
    };
  }
  if (errors.length > 0) return { ok: false, errors, receipt: null };
  return {
    ok: true,
    errors: [],
    receipt: {
      schema: INDEPENDENT_REVIEW_RECEIPT_SCHEMA,
      status: 'passed',
      authority: INDEPENDENT_REVIEW_AUTHORITY,
      reviewer: fields.reviewer,
      reviewId: fields.reviewId,
      headSha: fields.headSha,
      scope: INDEPENDENT_REVIEW_SCOPE,
      observedAt: new Date(observedMs).toISOString(),
    },
  };
}

function independentReviewReason(validation) {
  const first = validation.errors[0] || '';
  if (first === 'receipt is missing')
    return FLEET_GATE_REASON.INDEPENDENT_REVIEW_MISSING;
  if (first === 'review receipt is stale')
    return FLEET_GATE_REASON.INDEPENDENT_REVIEW_STALE;
  if (first === 'review receipt is from the future')
    return FLEET_GATE_REASON.INDEPENDENT_REVIEW_FUTURE;
  if (first === 'review head does not match current main head')
    return FLEET_GATE_REASON.INDEPENDENT_REVIEW_HEAD_MISMATCH;
  return FLEET_GATE_REASON.INDEPENDENT_REVIEW_MALFORMED;
}

/**
 * @param {unknown} candidate
 * @param {{ expectedHeadSha?: string, now?: string, maxAgeMs?: number }} [options]
 */
export function evaluateIndependentReviewReceipt(
  candidate,
  { expectedHeadSha, now = new Date().toISOString(), maxAgeMs } = {}
) {
  const validation = validateIndependentReviewReceipt(candidate, {
    expectedHeadSha,
    now,
    ...(maxAgeMs === undefined ? {} : { maxAgeMs }),
  });
  const fields = reviewReceiptFields(candidate);
  return {
    allowed: validation.ok,
    required: true,
    authority: INDEPENDENT_REVIEW_AUTHORITY,
    scope: INDEPENDENT_REVIEW_SCOPE,
    headSha: validation.receipt?.headSha ?? fields.headSha,
    observedAt: validation.receipt?.observedAt ?? fields.observedAt,
    reviewId: validation.receipt?.reviewId ?? fields.reviewId,
    reviewer: validation.receipt?.reviewer ?? fields.reviewer,
    reason: validation.ok
      ? 'fresh-exact-head-independent-review'
      : independentReviewReason(validation),
  };
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
 * Runtime may preserve already-queued work at its safe floor, but a new Linear
 * mutation requires a fresh approved capacity receipt. Missing, malformed, or
 * stale evidence therefore grants zero new leases rather than inventing four.
 */
export function resolveGemConcurrency(
  evidence,
  {
    now = new Date().toISOString(),
    maxAgeMs = CONCURRENCY_EVIDENCE_MAX_AGE_MS,
  } = {}
) {
  const nowMs = Date.parse(now);
  const measuredTarget = evidence?.target;
  const requiredCleanRuns =
    measuredTarget > DEFAULT_GEM_CONCURRENCY
      ? CAPACITY_POLICY.cleanRunsForMaximum
      : 1;
  const approvedAccepted =
    evidence?.schema === GEM_CONCURRENCY_EVIDENCE_SCHEMA &&
    Number.isInteger(measuredTarget) &&
    measuredTarget >= CAPACITY_POLICY.minimum &&
    measuredTarget <= MAX_EVIDENCE_BACKED_GEM_CONCURRENCY &&
    evidence?.approved === true &&
    Number.isInteger(evidence?.cleanRuns) &&
    evidence.cleanRuns >= requiredCleanRuns &&
    evidence?.severeIncidents === 0 &&
    isFreshTimestamp(evidence?.observedAt, nowMs, maxAgeMs);
  // A live measurement is only as fresh as the controller receipt that
  // carries it, so it shares the controller freshness window rather than the
  // approval receipt's longer one. It never exceeds the canon baseline.
  const liveMeasurementAccepted =
    evidence?.schema === GEM_MEASURED_CAPACITY_SCHEMA &&
    evidence?.source === 'measured-live' &&
    evidence?.accepted === true &&
    Number.isInteger(measuredTarget) &&
    measuredTarget >= CAPACITY_POLICY.minimum &&
    measuredTarget <= DEFAULT_GEM_CONCURRENCY &&
    evidence?.provider !== null &&
    typeof evidence?.provider === 'object' &&
    evidence?.runtime !== null &&
    typeof evidence?.runtime === 'object' &&
    isFreshTimestamp(
      evidence?.observedAt,
      nowMs,
      Math.min(maxAgeMs, CONTROLLER_RECEIPT_MAX_AGE_MS)
    );
  const evidenceAccepted = approvedAccepted || liveMeasurementAccepted;

  return {
    maxConcurrent: evidenceAccepted ? measuredTarget : 0,
    runtimeFloor: CAPACITY_POLICY.minimum,
    baseline: DEFAULT_GEM_CONCURRENCY,
    evidenceAccepted,
    newMutationAllowed: evidenceAccepted,
    preserveQueuedWork: CAPACITY_POLICY.preserveQueuedWork,
    reason: approvedAccepted
      ? 'recent-approved-measured-capacity'
      : liveMeasurementAccepted
        ? 'live-measured-capacity'
        : 'capacity-evidence-missing-malformed-or-stale',
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
  const reviewAdmission = evaluateIndependentReviewReceipt(
    evidence?.independentReview,
    {
      expectedHeadSha: evidence?.main?.sha,
      now,
    }
  );
  const closureAdmission = evaluateClosureAdmission(evidence?.closureHealth);

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
    if (!reviewAdmission.allowed) {
      reasons.push(
        typedReason(
          reviewAdmission.reason,
          'review',
          'warning',
          'Normal admission requires a fresh independent review of the exact current main head.'
        )
      );
    }
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
          'Production health is not bound to the exact deployed main SHA; promotion is frozen while isolated implementation continues.'
        )
      );
    }

    // JOV-INV-023: a missing/malformed queue snapshot is an observation gap
    // (GraphQL 502), never a promotion hold. boundGreenFactory stays drainable
    // and unbound production stays hold-intake. Drain classifies PRs itself.
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
  const greenReadyPrs =
    evidence?.queue?.greenReadyPrs ?? evidence?.queue?.eligiblePrs;
  const queueTarget = evidence?.queue?.target;
  const queueShapeValid =
    queueStatus === 'known' &&
    Number.isInteger(greenReadyPrs) &&
    greenReadyPrs >= 0 &&
    Number.isInteger(queueTarget) &&
    queueTarget > 0;
  const queueBelowBackpressure = queueShapeValid && greenReadyPrs < queueTarget;
  const isolatedPromotionAllowed =
    state === FLEET_GATE_STATE.AMBER &&
    reviewAdmission.allowed &&
    controllerFresh &&
    controllerStatus === 'green' &&
    mainStatus === 'green' &&
    productionStatus === 'red' &&
    ['clear', 'resolved'].includes(integrityStatus) &&
    queueBelowBackpressure &&
    reasons.every(
      reason => reason.code === FLEET_GATE_REASON.PRODUCTION_NOT_GREEN
    );
  const workActivities =
    state === FLEET_GATE_STATE.RED
      ? [...FLEET_AUTHORITY.RED]
      : !closureAdmission.newIssueIntakeAllowed
        ? ['tests', 'review']
        : [
            ...(concurrency.newMutationAllowed ? ['approved-issue-lease'] : []),
            ...FLEET_AUTHORITY.AMBER,
          ];
  const holdIntakeAllowed =
    state === FLEET_GATE_STATE.AMBER &&
    controllerFresh &&
    controllerStatus === 'green' &&
    mainStatus === 'green' &&
    productionStatus === 'green' &&
    productionUnbound &&
    ['clear', 'resolved'].includes(integrityStatus) &&
    reasons.length === 1 &&
    reasons[0]?.code === FLEET_GATE_REASON.PRODUCTION_DEPLOYMENT_UNBOUND;
  const promotionMode = isolatedPromotionAllowed
    ? FLEET_PROMOTION_MODE.ISOLATED_ONLY
    : state === FLEET_GATE_STATE.GREEN
      ? FLEET_PROMOTION_MODE.NORMAL
      : state === FLEET_GATE_STATE.AMBER &&
          mainStatus === 'red' &&
          ['clear', 'resolved'].includes(integrityStatus)
        ? FLEET_PROMOTION_MODE.DRAFT_ONLY
        : holdIntakeAllowed
          ? FLEET_PROMOTION_MODE.HOLD_INTAKE
          : FLEET_PROMOTION_MODE.BLOCKED;
  const cohort = alreadyAdmittedCohortSemantics(promotionMode);
  const closureAwareCohort = closureAdmission.newIssueIntakeAllowed
    ? cohort
    : {
        ...cohort,
        newIntakeAllowed: false,
        semantics: 'preserve-cohort-and-stop-new-implementation-intake',
      };
  return {
    schema: FLEET_GATE_SCHEMA,
    observedAt: evidence.observedAt || null,
    evaluatedAt: now,
    state,
    promotionMode,
    alreadyAdmittedCohort: closureAwareCohort,
    reasons,
    reviewAdmission,
    closureAdmission,
    workAdmission: {
      allowed: state !== FLEET_GATE_STATE.RED,
      activities: workActivities,
      newIssueLeaseAllowed: workActivities.includes('approved-issue-lease'),
      newImplementationAllowed: workActivities.includes('approved-issue-lease'),
    },
    promotionAdmission: {
      allowed: state === FLEET_GATE_STATE.GREEN && reviewAdmission.allowed,
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
      review: INDEPENDENT_REVIEW_AUTHORITY,
      directGemPickup: false,
    },
    concurrency: {
      gem: concurrency,
      symphonyImplementation: 'event-driven-backpressure',
    },
    laneCapacity:
      evidence?.queue?.laneCapacity?.global?.ready === greenReadyPrs &&
      evidence?.queue?.laneCapacity?.global?.budget === queueTarget
        ? evidence.queue.laneCapacity
        : null,
  };
}

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
  const planReceipt = planGateReceipt(issue);
  const admissionReceipt = admissionGateReceipt(issue);
  const planApproved =
    Boolean(planReceipt) || [...PLAN_LABELS].some(label => labels.has(label));
  const admissionApproved =
    Boolean(admissionReceipt) ||
    [...ADMISSION_LABELS].some(label => labels.has(label));
  return {
    planApproved,
    admissionApproved,
    eligible: Boolean(admissionReceipt),
    derivedLabels: {
      planApproved: [...PLAN_LABELS].some(label => labels.has(label)),
      admissionApproved: [...ADMISSION_LABELS].some(label => labels.has(label)),
      symphony: labels.has(SYMPHONY_LABEL),
    },
  };
}

export function buildAdmissionReceipt(
  issue,
  { now = new Date().toISOString(), fingerprint = '' } = {}
) {
  return `${ADMISSION_RECEIPT_PREFIX}${JSON.stringify({
    issue: issue.identifier,
    fingerprint,
    contextFingerprint:
      contextGateReceipt(issue, { now })?.payload?.fingerprint || '',
    researchFingerprint:
      researchGateReceipt(issue, { now })?.payload?.fingerprint || '',
    action: 'lease',
    at: now,
  })} -->`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment =>
    (comment.body || comment).includes(receipt)
  );
}

function issueForClassification(classification) {
  return classification.issue || classification;
}

function candidateAdmissionDecision(classification, bundledIds) {
  const issue = issueForClassification(classification);
  const preAdmission = preAdmissionDecision(issue);
  if (!preAdmission.allowed) return { eligible: false, preAdmission };
  const evidence = hasAdmissionEvidence(issue, classification);
  const state = issue.state?.name || classification.state;
  return {
    eligible:
      isConcreteJovieIssue(issue) &&
      !bundledIds.has(classification.identifier) &&
      classification.category === 'triageable' &&
      ['Triage', 'Backlog', 'Todo'].includes(state) &&
      !isTimOwned(issue) &&
      !issue.pullRequestUrl &&
      evidence.eligible,
    preAdmission,
  };
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
  const bundledIds = new Set(
    (workstreams || []).flatMap(workstream => workstream.issueIds || [])
  );
  const evaluations = classifications.map(classification => ({
    classification,
    decision: candidateAdmissionDecision(classification, bundledIds),
  }));
  const admissionDecisions = evaluations.map(
    ({ classification, decision }) => ({
      identifier:
        classification.identifier ||
        issueForClassification(classification).identifier,
      allowed: decision.eligible,
      preAdmission: decision.preAdmission,
    })
  );
  const candidates = evaluations
    .filter(({ decision }) => decision.eligible)
    .map(({ classification }) => ({
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
      admissionDecisions,
    };
  }
  const selected = candidates[0];
  return {
    admit: [selected],
    reason: `selected: ${selected.identifier} (score ${selected.score})`,
    fleetGate,
    admissionDecisions,
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
  const preAdmission = preAdmissionDecision(issue);
  if (!preAdmission.allowed)
    return {
      status: 'rejected',
      reason: preAdmission.reason.code,
      preAdmission,
    };
  if (!planGateReceipt(issue, { now }))
    return { status: 'rejected', reason: 'plan-receipt-missing-or-invalid' };
  if (!admissionGateReceipt(issue, { now }))
    return {
      status: 'rejected',
      reason: 'admission-receipt-missing-or-invalid',
    };
  const routing = verifyRoutingReceipt(issue);
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

  if (!contextGateReceipt(issue, { now }))
    return { status: 'rejected', reason: 'context-receipt-missing-or-invalid' };
  if (!researchGateReceipt(issue, { now }))
    return {
      status: 'rejected',
      reason: 'research-receipt-missing-or-invalid',
    };

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

  const currentPreAdmission = preAdmissionDecision(current);
  if (!currentPreAdmission.allowed)
    return {
      status: 'rejected',
      reason: currentPreAdmission.reason.code,
      preAdmission: currentPreAdmission,
    };

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

  const beforeReceiptPreAdmission = preAdmissionDecision(current);
  if (!beforeReceiptPreAdmission.allowed)
    return {
      status: 'rejected',
      reason: beforeReceiptPreAdmission.reason.code,
      preAdmission: beforeReceiptPreAdmission,
    };

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
      preAdmissionDecision(reread).allowed &&
      commentsOf(reread).some(comment =>
        (comment.body || comment).includes(receipt)
      ),
    'admission'
  );
  return { status: 'admitted', identifier: current.identifier, receipt };
}

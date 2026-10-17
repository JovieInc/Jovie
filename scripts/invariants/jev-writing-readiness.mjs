/**
 * Read-only writing pilot handoff (JOV-8415). Owner-verified evidence enters
 * here, never model-authored approvals. A candidate is a request to JOV-6414,
 * not admission, a dispatch lease, protected copy promotion, or send authority.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  evaluatePromotionGate,
  parsePromotionReceipt,
  parseRollbackReceipt,
} from '../../apps/web/lib/onboarding/promotion-gate.ts';
import { canonical } from '../lib/canonical-json.mjs';
import {
  WRITING_QUALITY_AXES,
  WRITING_QUALITY_RUBRICS,
} from './jev-writing-quality.mjs';
import { readWritingSurfacesRegistry } from './writing-surfaces.mjs';

export const WRITING_READINESS_SCHEMA = 'jovie.writing-pilot-readiness/v1';
export const WRITING_EVIDENCE_SCHEMA = 'jovie.writing-promotion-evidence/v1';
export const WRITING_PROMOTION_DECISION = Object.freeze({
  shipNow: 'observation pilot',
  reevaluateWhen:
    'calibrated held-out evidence and existing canary admission are available',
  then: 'use the existing bounded promotion path',
});
const SHA = /^[a-f0-9]{64}$/u;
const SOURCE_SHA = /^[a-f0-9]{40}$/u;
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => SHA.test(value);
const nonnegative = value => Number.isFinite(value) && value >= 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

/** Canonical JSON identity, not a signature or proof of owner authority. */
export function writingEvidenceDigest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
const textDigest = value => createHash('sha256').update(value).digest('hex');
const IMPLEMENTATION_SHA256 = textDigest(
  readFileSync(new URL(import.meta.url))
);

function fresh(value, now) {
  return (
    record(value) &&
    Number.isFinite(value.issuedAt) &&
    Number.isFinite(value.expiresAt) &&
    value.issuedAt <= now &&
    value.expiresAt > now &&
    value.expiresAt > value.issuedAt
  );
}
function uniqueStrings(values) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every(text) &&
    new Set(values).size === values.length
  );
}
function sameSet(left, right) {
  return (
    uniqueStrings(left) &&
    uniqueStrings(right) &&
    canonical([...left].sort()) === canonical([...right].sort())
  );
}
function validTarget(target) {
  return (
    record(target) &&
    SOURCE_SHA.test(target.sourceSha) &&
    [
      'implementationSha256',
      'artifactSha256',
      'evidenceSha256',
      'rubricSha256',
      'corpusSha256',
      'labelsSha256',
    ].every(key => digest(target[key])) &&
    [
      'surfaceId',
      'policyVersion',
      'resolvedModel',
      'writerModel',
      'audience',
      'destination',
    ].every(key => text(target[key])) &&
    target.rubricSha256 === writingEvidenceDigest(WRITING_QUALITY_RUBRICS) &&
    ['generated-message', 'onboarding-template'].includes(
      target.artifactKind
    ) &&
    Array.isArray(target.templateChanges) &&
    (target.artifactKind !== 'onboarding-template' ||
      target.templateChanges.length > 0) &&
    target.templateChanges.every(
      change =>
        record(change) &&
        text(change.lineKey) &&
        text(change.stepId) &&
        digest(change.textSha256) &&
        text(change.promotionReceiptId)
    )
  );
}
function evidenceRecord(value, kind, issue, targetDigest, now) {
  return (
    fresh(value, now) &&
    value.kind === kind &&
    value.issue === issue &&
    text(value.receiptId) &&
    text(value.ownerRef) &&
    value.targetDigest === targetDigest
  );
}
function readOnboardingReceipts() {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../apps/web/data/onboarding-script-promotions/receipts.json',
        import.meta.url
      ),
      'utf8'
    )
  ).receipts;
}

/** Apply the existing protected gate to the latest effective merged line state. */
function protectedTemplates(target, ledger) {
  if (!Array.isArray(ledger)) return false;
  const states = new Map();
  for (const entry of ledger) {
    const promotion = parsePromotionReceipt(entry);
    const rollback = parseRollbackReceipt(entry);
    if (promotion || rollback) {
      for (const change of (promotion ?? rollback).changes)
        states.set(`${change.stepId}:${change.lineKey}`, { promotion, change });
    }
  }
  return target.templateChanges.every(expected => {
    const state = states.get(`${expected.stepId}:${expected.lineKey}`);
    const promotion = state?.promotion;
    const check = promotion?.evidence.evalCheck;
    return (
      promotion?.receiptId === expected.promotionReceiptId &&
      evaluatePromotionGate(promotion.evidence).ok &&
      check.headSha === target.sourceSha &&
      text(check.runId) &&
      state.change.status === 'active' &&
      text(state.change.text) &&
      textDigest(state.change.text) === expected.textSha256
    );
  });
}

function calibrated(value) {
  const heldout = value.heldout;
  return (
    value.status === 'calibrated' &&
    text(value.version) &&
    !/provisional/iu.test(value.version) &&
    value.decision === 'eligible-for-bounded-canary' &&
    WRITING_QUALITY_AXES.every(
      axis =>
        nonnegative(value.minConfidence?.[axis]) &&
        value.minConfidence[axis] <= 1
    ) &&
    record(heldout) &&
    text(heldout.humanLabelsApprovalRef) &&
    heldout.labelProvenance === 'human-adjudicated' &&
    uniqueStrings(heldout.tuningDocumentIds) &&
    uniqueStrings(heldout.holdoutDocumentIds) &&
    !heldout.tuningDocumentIds.some(id =>
      heldout.holdoutDocumentIds.includes(id)
    ) &&
    heldout.excludedFromWriterPrompts === true &&
    digest(heldout.digest) &&
    digest(heldout.predeclaredLimitsDigest) &&
    Number.isFinite(heldout.limitsDeclaredAt) &&
    Number.isFinite(heldout.openedAt) &&
    heldout.limitsDeclaredAt < heldout.openedAt &&
    heldout.openedAt <= value.issuedAt
  );
}
function allowanceAvailable(value) {
  return (
    record(value) &&
    uniqueStrings(value.cohortIds) &&
    positiveInteger(value.maxCohortSize) &&
    Number.isSafeInteger(value.usedCohortSize) &&
    value.usedCohortSize >= 0 &&
    value.usedCohortSize < value.maxCohortSize &&
    value.cohortIds.length <= value.maxCohortSize &&
    positiveInteger(value.maxCalls) &&
    Number.isSafeInteger(value.usedCalls) &&
    value.usedCalls >= 0 &&
    value.usedCalls < value.maxCalls &&
    nonnegative(value.maxSpendUsd) &&
    nonnegative(value.spentUsd) &&
    nonnegative(value.nextCallUpperBoundUsd) &&
    (value.maxSpendUsd === 0 || value.spentUsd < value.maxSpendUsd) &&
    value.spentUsd + value.nextCallUpperBoundUsd <= value.maxSpendUsd
  );
}
function approved(value, targetDigest, now) {
  return (
    fresh(value, now) &&
    text(value.receiptRef) &&
    value.status === 'approved' &&
    value.targetDigest === targetDigest
  );
}
function operationalEvidence(value, now) {
  return (
    fresh(value.monitoring, now) &&
    text(value.monitoring.receiptRef) &&
    value.monitoring.status === 'healthy' &&
    fresh(value.rollback, now) &&
    text(value.rollback.receiptRef) &&
    text(value.rollback.targetRef) &&
    value.rollback.certified === true &&
    value.rollback.eligible === true &&
    fresh(value.killSwitch, now) &&
    text(value.killSwitch.receiptRef) &&
    value.killSwitch.tested === true &&
    value.killSwitch.active === false &&
    value.protectedMetricRegression === false &&
    value.cancelled === false
  );
}
function immutable(value) {
  if (record(value) || Array.isArray(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Pure preflight over trusted owner projections, never a new approval writer.
 * Times are epoch milliseconds. Expiry is supplied by the existing owners.
 * The optional ledger reader must read protected merged source, not generated
 * receipt JSON. Dispatch must revalidate authority, identity and durable usage.
 */
export function evaluateWritingReadiness(
  input = {},
  { now = Date.now(), onboardingReceipts = readOnboardingReceipts } = {}
) {
  const reasons = [];
  const deny = reason => reasons.push(reason);
  const target = input?.target;
  const targetOk = validTarget(target);
  const targetDigest = targetOk ? writingEvidenceDigest(target) : null;
  const calibration = input?.calibration;
  const report = input?.report;
  const admission = input?.admission;
  const receipts = input?.pilotReceipts;
  const ci = input?.hostedCi;
  if (input?.schema !== WRITING_EVIDENCE_SCHEMA || !Number.isFinite(now))
    deny('invalid-input');
  if (!targetOk) deny('invalid-target');
  const surface = targetOk
    ? readWritingSurfacesRegistry().surfaces.find(
        entry => entry.id === target.surfaceId
      )
    : null;
  if (!surface || surface.policyVersion !== target.policyVersion)
    deny('surface-policy-mismatch');
  const calOk =
    evidenceRecord(calibration, 'calibration', 'JOV-6476', targetDigest, now) &&
    calibrated(calibration);
  if (!calOk) deny('calibration-missing-stale-or-uncalibrated');
  const calibrationDigest = calOk ? writingEvidenceDigest(calibration) : null;
  const receiptsOk =
    Array.isArray(receipts) &&
    receipts.length > 0 &&
    uniqueStrings(receipts.map(receipt => receipt?.receiptId)) &&
    receipts.every(
      receipt =>
        evidenceRecord(
          receipt,
          'pilot-receipt',
          'JOV-3722',
          targetDigest,
          now
        ) &&
        receipt.status === 'reviewed' &&
        receipt.execution === 'gateway' &&
        calOk &&
        receipt.calibrationDigest === calibrationDigest &&
        receipt.calibrationVersion === calibration.version
    );
  if (!receiptsOk) deny('pilot-receipts-missing-stale-or-mismatched');
  const receiptDigests = receiptsOk
    ? receipts.map(writingEvidenceDigest).sort()
    : [];
  const reportOk =
    evidenceRecord(report, 'quality-report', 'JOV-8414', targetDigest, now) &&
    calOk &&
    receiptsOk &&
    report.calibrationDigest === calibrationDigest &&
    sameSet(report.pilotReceiptDigests, receiptDigests) &&
    report.heldoutDigest === calibration.heldout.digest &&
    report.predeclaredLimitsDigest ===
      calibration.heldout.predeclaredLimitsDigest &&
    report.status === 'eligible-for-bounded-canary' &&
    report.execution === 'gateway' &&
    positiveInteger(report.heldoutCount) &&
    report.comparisonPassed === true &&
    report.criticalFixturesPassed === true &&
    report.protectedMetricsPassed === true;
  if (!reportOk) deny('quality-report-missing-stale-or-inconclusive');
  const reportDigest = reportOk ? writingEvidenceDigest(report) : null;
  const admissionOk =
    evidenceRecord(
      admission,
      'canary-admission',
      'JOV-6414',
      targetDigest,
      now
    ) &&
    admission.status === 'admitted' &&
    text(admission.authorityRef) &&
    reportOk &&
    admission.reportDigest === reportDigest &&
    admission.calibrationDigest === calibrationDigest &&
    sameSet(admission.pilotReceiptDigests, receiptDigests);
  if (!admissionOk)
    deny('existing-canary-admission-missing-stale-or-mismatched');
  if (
    !approved(admission?.fundingApproval, targetDigest, now) ||
    !approved(admission?.privacyApproval, targetDigest, now)
  )
    deny('funding-or-privacy-approval-missing');
  if (!allowanceAvailable(admission?.allowance))
    deny('allowance-missing-invalid-or-exhausted');
  if (!admission || !operationalEvidence(admission, now))
    deny('monitoring-rollback-or-kill-switch-denied');
  const ciOk =
    fresh(ci, now) &&
    text(ci.receiptRef) &&
    ci.status === 'passed' &&
    targetOk &&
    ci.sourceSha === target.sourceSha;
  if (!ciOk) deny('exact-head-hosted-ci-absent');
  if (targetOk && target.templateChanges.length > 0) {
    try {
      if (!protectedTemplates(target, onboardingReceipts()))
        deny('protected-template-promotion-denied');
    } catch {
      deny('protected-template-promotion-denied');
    }
  }
  const candidate = reasons.length === 0;
  const identity = value =>
    value
      ? { receiptId: value.receiptId, sha256: writingEvidenceDigest(value) }
      : null;
  return immutable({
    schema: WRITING_READINESS_SCHEMA,
    disposition: candidate ? 'promotion-candidate' : 'denied',
    mode: 'observation',
    enforcementEnabled: false,
    trafficEnabled: false,
    sendAuthorized: false,
    reasons,
    decision: WRITING_PROMOTION_DECISION,
    targetDigest,
    evidence: {
      calibration: calOk ? identity(calibration) : null,
      qualityReport: reportOk ? identity(report) : null,
      pilotReceipts: receiptsOk ? receipts.map(identity) : [],
      admission: admissionOk ? identity(admission) : null,
    },
    proof: {
      localPreparation: {
        status: 'prepared',
        implementationSha256: IMPLEMENTATION_SHA256,
        suppliedTargetSourceSha: targetOk ? target.sourceSha : null,
      },
      hostedCi: ciOk
        ? {
            status: 'passed',
            sourceSha: ci.sourceSha,
            receiptRef: ci.receiptRef,
          }
        : { status: 'absent' },
      deployedBuild: {
        status: 'absent',
        reason: 'requires authorized deployment identity',
      },
      observedRuntime: {
        status: 'absent',
        reason: 'requires authorized exact-build canary execution',
      },
    },
    handoff: candidate
      ? {
          promotionOwnerIssue: 'JOV-6414',
          deliveryBoundaryIssue: 'JOV-3723',
          authorityRef: admission.authorityRef,
          targetDigest,
          calibrationDigest,
          reportDigest,
          pilotReceiptDigests: receiptDigests,
          admissionDigest: writingEvidenceDigest(admission),
          expiresAt: Math.min(
            calibration.expiresAt,
            report.expiresAt,
            admission.expiresAt,
            admission.monitoring.expiresAt,
            admission.rollback.expiresAt,
            admission.killSwitch.expiresAt,
            admission.fundingApproval.expiresAt,
            admission.privacyApproval.expiresAt,
            ci.expiresAt,
            ...receipts.map(receipt => receipt.expiresAt)
          ),
          requiresDispatchRevalidation: true,
        }
      : null,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let input;
  try {
    input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  } catch {
    input = {};
  }
  const result = evaluateWritingReadiness(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.disposition === 'promotion-candidate' ? 0 : 1;
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isCanonicalUtcTimestamp,
  isRecord,
  requireIsoTimestamp,
  requireString,
  requireStringArray,
} from '../summer-commissioning/receipt-trust.mjs';

export const BENCHMARK_REGISTRY_SCHEMA =
  'jovie.capability-benchmark-registry/v1';
export const SOURCING_RECEIPT_SCHEMA =
  'jovie.capability-benchmark.sourcing-receipt/v1';
export const CAPACITY_RECEIPT_SCHEMA =
  'jovie.capability-benchmark.capacity-receipt/v1';

/**
 * Sourcing states from JOV-2966. A decision records exactly one bounded state
 * per capability and use case; it is not a company-wide ideology.
 */
export const SOURCING_STATES = Object.freeze([
  'build',
  'adopt',
  'buy',
  'integrate',
  'adapt',
  'distill-learn',
  'open-source',
  'productize-license',
  'retain-internal-only',
  'retire',
]);

/**
 * Material trigger classes. There is deliberately no clock/periodic class:
 * low-value events accumulate by semantic signature until expected value
 * crosses threshold, and a material event is the only valid rerun reason
 * besides decision expiry.
 */
export const MATERIAL_TRIGGER_CLASSES = Object.freeze([
  'external-capability-discovered',
  'external-capability-materially-changed',
  'internal-capability-changed',
  'workload-failure-or-cost-changed',
  'customer-or-founder-reported-gap',
  'pending-decision-needs-comparison',
  'benchmark-evidence-expired',
]);

const NON_MATERIAL_TRIGGER_CLASSES = new Set([
  'clock-sweep',
  'periodic-review',
  'calendar-cadence',
]);

/**
 * Minimum metric ids for the first benchmark domain (code review /
 * implementation verification), straight from JOV-2966.
 */
export const REQUIRED_CODE_REVIEW_METRICS = Object.freeze([
  'real-bugs-caught-pre-merge',
  'false-positive-burden',
  'review-depth-coverage',
  'time-cost-to-actionable-review',
  'duplicate-noise',
  'learning-from-accepted-rejected-findings',
  'exact-head-runtime-verification',
]);

/**
 * Fields the Unified Ovi Certification Inbox requires. Only decisions that
 * warrant founder judgment escalate; routine adoption inside existing
 * authority proceeds autonomously with an outcome receipt.
 */
export const OVI_INBOX_FIELDS = Object.freeze([
  'evidence',
  'benchmarkResult',
  'recommendation',
  'confidence',
  'cost',
  'proposedBoundedAction',
  'capacityImpact',
]);

const FOUNDER_JUDGMENT_SCOPES = new Set([
  'portfolio-allocation-change',
  'new-product-or-company',
  'credential-or-billing-boundary',
]);

export function registryPath() {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    'capability-benchmark-registry.json'
  );
}

export function loadRegistry(path = registryPath()) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function registryDigest(registry) {
  return createHash('sha256').update(JSON.stringify(registry)).digest('hex');
}

/**
 * Classify a benchmark trigger event. Returns
 * {disposition: 'material'|'accumulate'|'reject', reason}.
 * A clock-class event is never material.
 */
export function classifyTriggerEvent(event) {
  if (!isRecord(event)) {
    return { disposition: 'reject', reason: 'event must be an object' };
  }
  if (NON_MATERIAL_TRIGGER_CLASSES.has(event.class)) {
    return {
      disposition: 'reject',
      reason: 'clock-based sweeps are not authorized',
    };
  }
  if (MATERIAL_TRIGGER_CLASSES.includes(event.class)) {
    if (typeof event.summary !== 'string' || event.summary.length === 0) {
      return {
        disposition: 'reject',
        reason: 'material event requires a summary',
      };
    }
    return { disposition: 'material', reason: 'material trigger class' };
  }
  if (
    typeof event.semanticSignature === 'string' &&
    event.semanticSignature.length > 0
  ) {
    return {
      disposition: 'accumulate',
      reason: 'low-value event accumulates by semantic signature',
    };
  }
  return {
    disposition: 'reject',
    reason: 'event is neither a material trigger nor accumulable',
  };
}

/**
 * Whether a sourcing decision must reach the Unified Ovi Certification Inbox.
 * Only founder-judgment scopes escalate; everything else is autonomous with
 * an outcome receipt.
 */
export function requiresOviCertification(decision) {
  if (!isRecord(decision)) return true;
  return FOUNDER_JUDGMENT_SCOPES.has(decision.scope);
}

/**
 * A decision is stale when past its expiration or when a listed rerun event
 * has occurred. Callers pass the current UTC clock explicitly.
 */
export function isDecisionStale(decision, nowUtc) {
  if (!isRecord(decision)) return true;
  if (decision.supersededBy) return true;
  if (!isCanonicalUtcTimestamp(nowUtc)) {
    throw new Error('nowUtc must be a canonical UTC timestamp');
  }
  if (
    isCanonicalUtcTimestamp(decision.expiresAt) &&
    nowUtc > decision.expiresAt
  ) {
    return true;
  }
  return false;
}

function validateTaskSuite(suite, field) {
  if (!isRecord(suite)) throw new Error(`${field} must be an object`);
  requireString(suite.id, `${field}.id`);
  requireString(suite.version, `${field}.version`);
  requireString(suite.ref, `${field}.ref`);
  requireString(suite.groundTruth, `${field}.groundTruth`);
  requireStringArray(suite.adversarialCases, `${field}.adversarialCases`);
}

const DOMAIN_STATUSES = new Set(['defined', 'scheduled', 'run-complete']);

function validateCandidate(candidate, field, status) {
  if (!isRecord(candidate)) throw new Error(`${field} must be an object`);
  requireString(candidate.id, `${field}.id`);
  requireString(candidate.kind, `${field}.kind`);
  if (
    !['internal', 'external', 'open-source', 'baseline'].includes(
      candidate.kind
    )
  ) {
    throw new Error(
      `${field}.kind must be internal|external|open-source|baseline`
    );
  }
  requireString(candidate.version, `${field}.version`);
  requireString(candidate.provenance, `${field}.provenance`);
  if (
    candidate.kind !== 'internal' &&
    status === 'run-complete' &&
    candidate.identityVerified !== true
  ) {
    throw new Error(
      `${field}.identityVerified must be true before a named external system counts as benchmark proof`
    );
  }
}

function validateDomain(domain) {
  if (!isRecord(domain)) throw new Error('domain must be an object');
  requireString(domain.id, 'domain.id');
  requireString(domain.capability, 'domain.capability');
  requireString(domain.userOutcome, 'domain.userOutcome');
  if (!DOMAIN_STATUSES.has(domain.status)) {
    throw new Error(
      `domain.status must be one of ${[...DOMAIN_STATUSES].join('|')}`
    );
  }
  validateTaskSuite(domain.taskSuite, 'domain.taskSuite');
  requireStringArray(domain.metrics, 'domain.metrics');
  for (const metric of REQUIRED_CODE_REVIEW_METRICS) {
    if (
      domain.id === 'code-review-verification' &&
      !domain.metrics.includes(metric)
    ) {
      throw new Error(`domain.metrics missing required metric ${metric}`);
    }
  }
  if (!Array.isArray(domain.candidates) || domain.candidates.length < 2) {
    throw new Error('domain.candidates must list at least two candidates');
  }
  domain.candidates.forEach((c, i) =>
    validateCandidate(c, `domain.candidates[${i}]`, domain.status)
  );
  if (!domain.candidates.some(c => c.kind === 'internal')) {
    throw new Error(
      'domain.candidates requires at least one internal candidate'
    );
  }
  if (
    !domain.candidates.some(
      c => c.kind === 'external' || c.kind === 'open-source'
    )
  ) {
    throw new Error(
      'domain.candidates requires at least one external or open-source challenger'
    );
  }
  if (!isRecord(domain.decision)) throw new Error('domain.decision missing');
  validateSourcingDecision(domain.decision, `domain.decision`);
}

function validateSourcingDecision(decision, field) {
  requireString(decision.id, `${field}.id`);
  if (!SOURCING_STATES.includes(decision.state)) {
    throw new Error(
      `${field}.state must be one of ${SOURCING_STATES.join('|')}`
    );
  }
  requireString(decision.scope, `${field}.scope`);
  requireString(decision.expectedEconomics, `${field}.expectedEconomics`);
  requireString(decision.dependencyRisk, `${field}.dependencyRisk`);
  requireString(decision.reversibility, `${field}.reversibility`);
  requireString(decision.reEvaluateTrigger, `${field}.reEvaluateTrigger`);
  requireIsoTimestamp(decision.decidedAt, `${field}.decidedAt`);
  requireIsoTimestamp(decision.expiresAt, `${field}.expiresAt`);
}

/**
 * Validate the whole registry. Throws on the first structural violation;
 * fails closed on schema mismatch.
 */
export function validateBenchmarkRegistry(registry) {
  if (!isRecord(registry)) throw new Error('registry must be an object');
  if (registry.schema !== BENCHMARK_REGISTRY_SCHEMA) {
    throw new Error(`schema must be ${BENCHMARK_REGISTRY_SCHEMA}`);
  }
  requireString(registry.issue, 'registry.issue');
  requireIsoTimestamp(registry.auditedAt, 'registry.auditedAt');
  requireString(
    registry.evidenceLifecycleIssue,
    'registry.evidenceLifecycleIssue'
  );
  if (registry.secondLedger === true) {
    throw new Error('registry must not create a second evidence ledger');
  }
  if (!isRecord(registry.triggerPolicy)) {
    throw new Error('registry.triggerPolicy missing');
  }
  if (registry.triggerPolicy.clockSweep !== false) {
    throw new Error('triggerPolicy.clockSweep must be false');
  }
  for (const cls of registry.triggerPolicy.materialEvents ?? []) {
    if (!MATERIAL_TRIGGER_CLASSES.includes(cls)) {
      throw new Error(`unknown material trigger class ${cls}`);
    }
  }
  if (
    registry.triggerPolicy.lowValueAccumulation?.bySemanticSignature !== true
  ) {
    throw new Error(
      'triggerPolicy.lowValueAccumulation.bySemanticSignature must be true'
    );
  }
  if (
    !Array.isArray(registry.evidenceProducers) ||
    registry.evidenceProducers.length === 0
  ) {
    throw new Error('registry.evidenceProducers must be a non-empty array');
  }
  for (const [i, producer] of registry.evidenceProducers.entries()) {
    requireString(producer.id, `evidenceProducers[${i}].id`);
    requireString(
      producer.canonicalLifecycle,
      `evidenceProducers[${i}].canonicalLifecycle`
    );
  }
  if (!Array.isArray(registry.domains) || registry.domains.length === 0) {
    throw new Error('registry.domains must be a non-empty array');
  }
  registry.domains.forEach(validateDomain);
  if (registry.capacity?.preemptible !== true) {
    throw new Error('registry.capacity.preemptible must be true');
  }
  requireStringArray(
    registry.capacity.revenuePathBlockers,
    'registry.capacity.revenuePathBlockers'
  );
  if (!registry.capacity.revenuePathBlockers.includes('JOV-5911')) {
    throw new Error('capacity.revenuePathBlockers must include JOV-5911');
  }
  return true;
}

/**
 * Validate a completed shadow/replay comparison. Matching a fashionable
 * external recommendation is not success: the receipt must compare the
 * selected route AND the certified job outcome on the same cohort.
 */
export function validateShadowReplayReceipt(receipt) {
  const errors = [];
  if (!isRecord(receipt)) return ['receipt must be an object'];
  requireSoft(receipt, 'cohortId', errors);
  requireSoft(receipt, 'cohortVersion', errors);
  if (!Array.isArray(receipt.contenders) || receipt.contenders.length < 2) {
    errors.push('contenders must include the internal router and a challenger');
  } else {
    if (!receipt.contenders.some(c => c.role === 'internal')) {
      errors.push('contenders requires role=internal');
    }
    if (
      !receipt.contenders.some(
        c => c.role === 'external' || c.role === 'open-source'
      )
    ) {
      errors.push('contenders requires an external or open-source challenger');
    }
  }
  if (!isRecord(receipt.routeComparison)) {
    errors.push('routeComparison missing');
  }
  if (!isRecord(receipt.outcomeComparison)) {
    errors.push(
      'outcomeComparison missing: recommendation match is not certified outcome'
    );
  }
  if (receipt.recommendationMatchOnly === true) {
    errors.push('recommendationMatchOnly must be false');
  }
  return errors;
}

function requireSoft(record, field, errors) {
  if (typeof record[field] !== 'string' || record[field].length === 0) {
    errors.push(`${field} missing`);
  }
}

/**
 * Validate a capacity receipt proving the benchmark lane is preemptible and
 * did not delay an eligible first-revenue-path blocker.
 */
export function validateCapacityReceipt(receipt) {
  const errors = [];
  if (!isRecord(receipt)) return ['capacity receipt must be an object'];
  if (receipt.schema !== CAPACITY_RECEIPT_SCHEMA) {
    errors.push(`schema must be ${CAPACITY_RECEIPT_SCHEMA}`);
  }
  if (receipt.preemptible !== true) errors.push('preemptible must be true');
  if (!Array.isArray(receipt.eligibleBlockersDisplaced)) {
    errors.push('eligibleBlockersDisplaced must be an array');
  } else if (receipt.eligibleBlockersDisplaced.length !== 0) {
    errors.push(
      'benchmark lane must not displace eligible revenue-path blockers'
    );
  }
  if (!isCanonicalUtcTimestamp(receipt.recordedAt)) {
    errors.push('recordedAt must be a canonical UTC timestamp');
  }
  return errors;
}

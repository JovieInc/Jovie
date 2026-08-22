export const LEARNING_RECEIPT_SCHEMA = 'jovie-rolling-ci-learning/v1';
export const LEARNING_RECEIPT_MARKER = 'jovie-rolling-ci-learning';

const SHA_RE = /^[0-9a-f]{40}$/i;
const FAILURE_KINDS = new Set(['product', 'environment', 'one-off']);
const GUARDRAIL_DELIVERIES = new Set(['same-pr', 'linked-follow-up']);
const ENVIRONMENT_INCIDENT_CLASSES = new Set(['runner', 'execution-path']);

/** @typedef {{ repository: string, pr: number, head: string, check: string, fingerprint: string }} LearningIdentity */
/** @typedef {{ schema: string, identity: LearningIdentity, failureKind: string, rootCauseClass: string, currentHeadReproduction: { reproduced: boolean, head: string, evidence: string }, minimalRepair: string, equivalentSurfaceSweep: { surfaces: string[], outcome: string }, deliberateRedRegression: { fixture: string, failsBeforeRepair: boolean, passesAfterRepair: boolean }, guardrailDecision: { warranted: boolean, reason: string, delivery?: string, followUpIssue?: string }, environmentRemediation?: { incidentClass?: string, executionPathClassifier?: string, runnerFix?: string }, antiRuleSprawlReason?: string, exactHeadGreen: boolean }} LearningReceipt */
/** @typedef {{ repository: string, pr: number, check: string, fingerprint: string, status: string, repairedHead: string }} RepairedFailure */
/** @typedef {{ repairedFailures?: RepairedFailure[], receipts?: LearningReceipt[], comments?: Array<string | LearningReceipt>, liveHead?: string }} LearningPromotionInput */

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validIdentity(identity) {
  return (
    /^[^/\s]+\/[^/\s]+$/.test(String(identity?.repository ?? '')) &&
    Number.isInteger(identity?.pr) &&
    identity.pr > 0 &&
    SHA_RE.test(String(identity?.head ?? '')) &&
    nonEmpty(identity?.check) &&
    nonEmpty(identity?.fingerprint)
  );
}

export function learningReceiptKey(identity) {
  if (!validIdentity(identity)) throw new Error('invalid learning identity');
  return [
    identity.repository,
    identity.pr,
    identity.head.toLowerCase(),
    identity.check,
    identity.fingerprint,
  ].join(':');
}

export function learningReceiptMarker(receipt) {
  const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url');
  return `<!-- ${LEARNING_RECEIPT_MARKER}:${encoded} -->`;
}

export function parseLearningReceiptMarker(body) {
  const match = String(body ?? '').match(
    new RegExp(`<!-- ${LEARNING_RECEIPT_MARKER}:([A-Za-z0-9_-]+) -->`)
  );
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function collectLearningReceipts(bodies = []) {
  return (Array.isArray(bodies) ? bodies : [bodies])
    .map(body =>
      typeof body === 'string' ? parseLearningReceiptMarker(body) : body
    )
    .filter(receipt => receipt && validIdentity(receipt.identity));
}

/**
 * @param {LearningReceipt} [receipt]
 * @param {{ liveHead?: string }} [options]
 */
export function validateLearningReceipt(receipt, options = {}) {
  const liveHead = options.liveHead;
  const errors = [];
  if (receipt?.schema !== LEARNING_RECEIPT_SCHEMA)
    errors.push('invalid learning receipt schema');
  if (!validIdentity(receipt?.identity))
    errors.push('invalid learning identity');
  if (liveHead && receipt?.identity?.head !== liveHead)
    errors.push('learning receipt is not for the current head');
  if (!FAILURE_KINDS.has(receipt?.failureKind))
    errors.push('invalid failure kind');
  if (!nonEmpty(receipt?.rootCauseClass))
    errors.push('rootCauseClass is required');

  const reproduction = receipt?.currentHeadReproduction;
  if (
    reproduction?.reproduced !== true ||
    reproduction?.head !== receipt?.identity?.head ||
    !nonEmpty(reproduction?.evidence)
  ) {
    errors.push('current-head reproduction is required');
  }
  if (!nonEmpty(receipt?.minimalRepair))
    errors.push('minimalRepair is required');

  const sweep = receipt?.equivalentSurfaceSweep;
  if (
    !Array.isArray(sweep?.surfaces) ||
    sweep.surfaces.length === 0 ||
    sweep.surfaces.some(surface => !nonEmpty(surface)) ||
    !nonEmpty(sweep?.outcome)
  ) {
    errors.push('equivalent-surface sweep is required');
  }

  const regression = receipt?.deliberateRedRegression;
  if (
    !nonEmpty(regression?.fixture) ||
    regression?.failsBeforeRepair !== true ||
    regression?.passesAfterRepair !== true
  ) {
    errors.push('deliberate-red before-and-after proof is required');
  }

  const guardrail = receipt?.guardrailDecision;
  if (
    typeof guardrail?.warranted !== 'boolean' ||
    !nonEmpty(guardrail?.reason)
  ) {
    errors.push('guardrail decision and reason are required');
  } else if (guardrail.warranted) {
    if (receipt?.failureKind !== 'product') {
      errors.push('environment and one-off failures cannot add product guards');
    }
    if (!GUARDRAIL_DELIVERIES.has(guardrail.delivery)) {
      errors.push('guardrail delivery must be same-pr or linked-follow-up');
    }
    if (
      guardrail.delivery === 'linked-follow-up' &&
      !/^JOV-\d+$/.test(String(guardrail.followUpIssue ?? ''))
    ) {
      errors.push('linked guardrail follow-up requires an owned Linear issue');
    }
  }

  if (receipt?.failureKind === 'environment') {
    const incidentClass = receipt?.environmentRemediation?.incidentClass;
    if (!ENVIRONMENT_INCIDENT_CLASSES.has(incidentClass)) {
      errors.push(
        'environment failures require a runner or execution-path incident class'
      );
    } else if (
      incidentClass === 'execution-path' &&
      !nonEmpty(receipt?.environmentRemediation?.executionPathClassifier)
    ) {
      errors.push('execution-path incidents require a classifier');
    } else if (
      incidentClass === 'runner' &&
      !nonEmpty(receipt?.environmentRemediation?.runnerFix)
    ) {
      errors.push('runner incidents require a runner fix');
    }
  }
  if (
    receipt?.failureKind === 'one-off' &&
    !nonEmpty(receipt?.antiRuleSprawlReason)
  ) {
    errors.push('one-off failures require an anti-rule-sprawl reason');
  }
  if (receipt?.exactHeadGreen !== true)
    errors.push('repaired head is not exact-head green');

  return { ok: errors.length === 0, errors };
}

function repairedFailureKey(failure, liveHead) {
  try {
    return learningReceiptKey({
      repository: failure.repository,
      pr: failure.pr,
      head: liveHead,
      check: failure.check,
      fingerprint: failure.fingerprint,
    });
  } catch {
    return null;
  }
}

/**
 * Blocks promotion only for repaired failures missing an exact-head receipt.
 * Required CI is an independent gate.
 * @param {LearningPromotionInput} [input]
 */
export function evaluateLearningPromotion(input = {}) {
  const {
    repairedFailures = [],
    receipts = [],
    comments = [],
    liveHead,
  } = input;
  if (!SHA_RE.test(String(liveHead ?? '')))
    throw new Error('liveHead must be a 40-character SHA');

  const receiptByKey = new Map();
  for (const receipt of [
    ...collectLearningReceipts(comments),
    ...(Array.isArray(receipts) ? receipts : []),
  ]) {
    if (!validIdentity(receipt?.identity)) continue;
    receiptByKey.set(learningReceiptKey(receipt.identity), receipt);
  }

  const blockers = [];
  const required = new Map();
  for (const failure of repairedFailures) {
    if (failure?.status !== 'repaired') continue;
    const key = repairedFailureKey(failure, liveHead);
    if (!key) {
      blockers.push({
        key: 'invalid-repaired-failure',
        reason: 'repaired-failure-identity-invalid',
      });
      continue;
    }
    required.set(key, failure);
  }

  for (const [key, failure] of required) {
    if (failure.repairedHead !== liveHead) {
      blockers.push({
        key,
        reason: 'repair-not-revalidated-on-current-head',
      });
      continue;
    }
    const receipt = receiptByKey.get(key);
    if (!receipt) {
      blockers.push({ key, reason: 'learning-receipt-missing' });
      continue;
    }
    const validation = validateLearningReceipt(receipt, { liveHead });
    if (!validation.ok) {
      blockers.push({
        key,
        reason: 'learning-receipt-invalid',
        errors: validation.errors,
      });
    }
  }

  return {
    complete: blockers.length === 0,
    requiredReceipts: required.size,
    acceptedReceipts: Math.max(0, required.size - blockers.length),
    blockers,
  };
}

/**
 * @param {LearningPromotionInput} [input]
 */
export function evaluatePromotionReceipt(input) {
  return evaluateLearningPromotion(input);
}

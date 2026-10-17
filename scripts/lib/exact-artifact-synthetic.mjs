import { createHash } from 'node:crypto';

export const JOURNEY_SCHEMA = 'jovie-exact-artifact-journey/v1';
export const RECEIPT_SCHEMA = 'jovie-exact-artifact-synthetic/v1';
export const SOAK_SCHEMA = 'jovie-exact-artifact-soak/v1';

export const REQUIRED_TRANSITIONS = Object.freeze([
  'authentication',
  'profile-readiness',
  'checkout',
  'webhook-entitlement',
  'returning-session',
  'cleanup',
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/u;
const SAFE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const AUTH_METHODS = new Set([
  'apple-oauth',
  'google-oauth',
  'oauth',
  'otp',
  'passkey',
  'unavailable',
]);
const CLEANUP_STATES = new Set(['clean', 'failed', 'not-started', 'retained']);
const TRANSITION_STATUSES = new Set(['failed', 'passed', 'skipped']);
const SENSITIVE_PUBLIC_VALUE_PATTERN =
  /(?:\b(?:cs|sub)_(?:live|test)_|\b(?:sk|rk|pk)_live_|bearer\s|cookie=|password=|secret=|token=|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value, maximum = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

function isoTimestamp(value, fallback) {
  const candidate = boundedString(value, 40);
  return candidate && Number.isFinite(Date.parse(candidate))
    ? new Date(candidate).toISOString()
    : fallback;
}

function safeCode(value, fallback = 'unknown') {
  const candidate = boundedString(value, 64)?.toLowerCase();
  return candidate && SAFE_CODE_PATTERN.test(candidate) ? candidate : fallback;
}

function safeEvidenceReference(value) {
  const candidate = boundedString(value, 500);
  if (
    !candidate ||
    /\s/u.test(candidate) ||
    SENSITIVE_PUBLIC_VALUE_PATTERN.test(candidate)
  ) {
    return null;
  }
  return candidate;
}

function publicStringArray(value, maximum = 50) {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map(item => boundedString(item, 500));
  if (
    normalized.some(item => !item || SENSITIVE_PUBLIC_VALUE_PATTERN.test(item))
  ) {
    return null;
  }
  return normalized;
}

function normalizeCompletionEvidence(value) {
  const evidence = isRecord(value) ? value : {};
  const mergedShas = publicStringArray(evidence.mergedShas) ?? [];
  const rollbackPaths = publicStringArray(evidence.rollbackPaths) ?? [];
  return {
    mergedShas: mergedShas.filter(sha => SHA_PATTERN.test(sha)),
    migrationVersion: boundedString(evidence.migrationVersion, 100),
    ciReceipt: safeEvidenceReference(evidence.ciReceipt),
    deployedBuildSha: SHA_PATTERN.test(evidence.deployedBuildSha ?? '')
      ? evidence.deployedBuildSha
      : null,
    returningSessionProof: safeEvidenceReference(
      evidence.returningSessionProof
    ),
    rollbackPaths,
    acceptedRisks: Array.isArray(evidence.acceptedRisks)
      ? publicStringArray(evidence.acceptedRisks)
      : null,
  };
}

function normalizeTransitions(value, fallbackAt) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return [];
  }
  return value
    .map(transition => {
      if (!isRecord(transition)) return null;
      const name = safeCode(transition.name, '');
      const status = boundedString(transition.status, 16);
      if (!name || !TRANSITION_STATUSES.has(status)) return null;
      const durationMs = Number.isSafeInteger(transition.durationMs)
        ? Math.max(0, transition.durationMs)
        : null;
      return {
        name,
        status,
        at: isoTimestamp(transition.at, fallbackAt),
        code: status === 'failed' ? safeCode(transition.code, 'unknown') : null,
        durationMs,
      };
    })
    .filter(Boolean);
}

function receiptIdFor(buildSha, attemptId) {
  return createHash('sha256')
    .update(`${buildSha}:${attemptId}`)
    .digest('hex')
    .slice(0, 24);
}

function rootCauseFingerprint(classification, transition) {
  return [
    'exact-artifact',
    classification,
    safeCode(transition?.name, 'preflight'),
    safeCode(transition?.code, 'unknown'),
  ].join('-');
}

function failedTransition(transitions) {
  return transitions.find(transition => transition.status === 'failed') ?? null;
}

function pathStatusFor(outcome, classification, transition, requestedStatus) {
  if (outcome === 'success') return 'healthy';
  if (classification === 'infrastructure') return 'unknown';
  if (requestedStatus === 'degraded') return 'degraded';
  return transition?.name === 'cleanup' ? 'degraded' : 'blocked';
}

function evidenceIsComplete(evidence, buildSha) {
  return (
    evidence.mergedShas.length > 0 &&
    evidence.migrationVersion !== null &&
    evidence.ciReceipt !== null &&
    evidence.deployedBuildSha === buildSha &&
    evidence.returningSessionProof !== null &&
    evidence.rollbackPaths.length > 0 &&
    evidence.acceptedRisks !== null
  );
}

/**
 * Convert a journey result into the one authoritative private receipt. Unknown
 * input keys are intentionally discarded so OTPs, cookies, emails, and tokens
 * cannot cross the receipt boundary.
 */
export function buildExactArtifactReceipt({
  result,
  buildInfo,
  attemptId,
  event,
  runUrl,
  producerStatus = 0,
  now = new Date(),
}) {
  const generatedAt = now.toISOString();
  const input = isRecord(result) ? result : {};
  const binding = isRecord(buildInfo) ? buildInfo : {};
  const buildSha = SHA_PATTERN.test(binding.commitSha ?? '')
    ? binding.commitSha
    : 'unknown';
  const deploymentId = DEPLOYMENT_PATTERN.test(binding.deploymentId ?? '')
    ? binding.deploymentId
    : 'unknown';
  const safeAttemptId = boundedString(attemptId, 120) ?? 'unknown';
  const startedAt = isoTimestamp(input.startedAt, generatedAt);
  const completedAt = isoTimestamp(input.completedAt, generatedAt);
  const transitions = normalizeTransitions(input.transitions, completedAt);

  let validationFailure = null;
  if (!isRecord(result)) {
    validationFailure = {
      name: 'preflight',
      code:
        Number(producerStatus) === 78
          ? 'journey-producer-unavailable'
          : 'journey-result-missing',
    };
  } else if (input.schema !== JOURNEY_SCHEMA) {
    validationFailure = { name: 'preflight', code: 'journey-result-malformed' };
  } else if (buildSha === 'unknown' || deploymentId === 'unknown') {
    validationFailure = {
      name: 'production-binding',
      code: 'production-binding-missing',
    };
  } else {
    const observed = new Set(
      transitions
        .filter(transition => transition.status === 'passed')
        .map(transition => transition.name)
    );
    const missing = REQUIRED_TRANSITIONS.find(name => !observed.has(name));
    if (missing && !failedTransition(transitions)) {
      validationFailure = {
        name: 'receipt-validation',
        code: `missing-${missing}`,
      };
    }
  }

  if (validationFailure) {
    transitions.push({
      ...validationFailure,
      status: 'failed',
      at: completedAt,
      durationMs: null,
    });
  }

  const failure = failedTransition(transitions);
  const cleanupState = CLEANUP_STATES.has(input.finalCleanupState)
    ? input.finalCleanupState
    : 'not-started';
  const controlledIdentifiers = {
    checkoutId: boundedString(input.controlledCheckoutId, 255),
    subscriptionId: boundedString(input.controlledSubscriptionId, 255),
  };
  const hasControlledIdentifiers = Boolean(
    controlledIdentifiers.checkoutId && controlledIdentifiers.subscriptionId
  );
  if (!failure && (!hasControlledIdentifiers || cleanupState !== 'clean')) {
    transitions.push({
      name: 'receipt-validation',
      status: 'failed',
      at: completedAt,
      code: hasControlledIdentifiers
        ? 'cleanup-not-clean'
        : 'controlled-identifiers-missing',
      durationMs: null,
    });
  }

  const finalFailure = failedTransition(transitions);
  const outcome = finalFailure ? 'failure' : 'success';
  const requestedClassification = boundedString(
    input.failureClassification,
    20
  );
  const classification =
    outcome === 'success' || requestedClassification === 'product'
      ? 'product'
      : 'infrastructure';
  const pathStatus = pathStatusFor(
    outcome,
    classification,
    finalFailure,
    input.pathStatus
  );
  const completionEvidence = normalizeCompletionEvidence(
    input.completionEvidence
  );

  return {
    schema: RECEIPT_SCHEMA,
    receiptId: receiptIdFor(buildSha, safeAttemptId),
    generatedAt,
    startedAt,
    completedAt,
    event: boundedString(event, 40) ?? 'unknown',
    runUrl: safeEvidenceReference(runUrl),
    buildSha,
    deploymentId,
    attemptId: safeAttemptId,
    authMethod: AUTH_METHODS.has(input.authMethod)
      ? input.authMethod
      : 'unavailable',
    transitions,
    outcome,
    controlledRun: outcome === 'success' && hasControlledIdentifiers,
    finalCleanupState: cleanupState,
    classification,
    pathStatus,
    rootCauseFingerprint: finalFailure
      ? rootCauseFingerprint(classification, finalFailure)
      : null,
    controlledIdentifiers,
    completionEvidence,
  };
}

export function privateReceiptDigest(receipt) {
  return createHash('sha256')
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

/** A deliberately small projection safe for public Actions logs/artifacts. */
export function redactExactArtifactReceipt(receipt, privateStorage = null) {
  return {
    ...receipt,
    controlledIdentifiers: {
      checkoutId: receipt.controlledIdentifiers.checkoutId
        ? '[redacted]'
        : null,
      subscriptionId: receipt.controlledIdentifiers.subscriptionId
        ? '[redacted]'
        : null,
    },
    privateReceipt: privateStorage,
  };
}

export function classifyPrivateStorageFailure(receipt, now = new Date()) {
  const transition = {
    name: 'private-receipt',
    status: 'failed',
    at: now.toISOString(),
    code: 'private-receipt-write-failed',
    durationMs: null,
  };
  return {
    ...receipt,
    completedAt: transition.at,
    transitions: [...receipt.transitions, transition],
    outcome: 'failure',
    controlledRun: false,
    classification: 'infrastructure',
    pathStatus: 'unknown',
    rootCauseFingerprint: rootCauseFingerprint('infrastructure', transition),
  };
}

function utcDay(value) {
  return value.slice(0, 10);
}

function expectedDays(windowDays, now) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return Array.from({ length: windowDays }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (windowDays - index - 1));
    return day.toISOString().slice(0, 10);
  });
}

export function evaluateExactArtifactSoak({ receipts, windowDays, now }) {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) {
    throw new Error('soak window must be an integer from 1 through 90 days');
  }
  const evaluatedAt = now.toISOString();
  const days = expectedDays(windowDays, now);
  const expected = new Set(days);
  const scheduled = receipts
    .filter(receipt => receipt?.schema === RECEIPT_SCHEMA)
    .filter(receipt => receipt.event === 'schedule')
    .filter(receipt => expected.has(utcDay(receipt.startedAt ?? '')))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const present = new Set(scheduled.map(receipt => utcDay(receipt.startedAt)));
  const missingDays = days.filter(day => !present.has(day));
  const successful = scheduled.filter(
    receipt =>
      receipt.outcome === 'success' &&
      receipt.controlledRun === true &&
      receipt.finalCleanupState === 'clean'
  );
  const latest = scheduled.at(-1) ?? null;
  const latestEvidence = latest?.completionEvidence ?? null;
  const completionEvidenceComplete = Boolean(
    latest &&
      latestEvidence &&
      evidenceIsComplete(latestEvidence, latest.buildSha)
  );
  const complete =
    missingDays.length === 0 &&
    scheduled.length > 0 &&
    successful.length === scheduled.length &&
    completionEvidenceComplete;

  return {
    schema: SOAK_SCHEMA,
    status: complete ? 'complete' : 'incomplete',
    evaluatedAt,
    windowDays,
    windowStart: days[0],
    windowEnd: days.at(-1),
    expectedDays: days,
    missingDays,
    attempts: scheduled.length,
    successfulAttempts: successful.length,
    successRate:
      scheduled.length === 0 ? 0 : successful.length / scheduled.length,
    receiptIds: scheduled.map(receipt => receipt.receiptId),
    completionEvidenceComplete,
    completionEvidence: latestEvidence
      ? {
          mergedShas: latestEvidence.mergedShas,
          migrationVersion: latestEvidence.migrationVersion,
          ciReceipt: latestEvidence.ciReceipt,
          deployedBuildSha: latestEvidence.deployedBuildSha,
          returningSessionProof: latestEvidence.returningSessionProof,
          rollbackPaths: latestEvidence.rollbackPaths,
          acceptedRisks: latestEvidence.acceptedRisks,
        }
      : null,
  };
}

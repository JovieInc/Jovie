/** Evidence-bound JOV-INV-028 consumer; no fetch, send, policy change, or external authorization. */
export const GROWTH_LEARNING_INVARIANT_ID = 'JOV-INV-028';
export const GROWTH_LEARNING_SCHEMA = 'jovie-growth-learning/v1';
export const GROWTH_LEARNING_RETENTION_REVIEW_FLOOR =
  '2026-11-18T00:00:00.000Z';
const SIGNAL_WINDOW_DAYS = 14;
const RETAINED_USE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const RANDOMIZATION_METHOD = 'reproducible-account-level-randomization';
export const GROWTH_LEARNING_PHASES = Object.freeze([
  'discover',
  'assess',
  'propose',
  'authorize',
  'measure',
  'amend-or-reject',
]);
export const GROWTH_LEARNING_EVIDENCE_CLASSES = Object.freeze([
  'self-reported-anecdote',
  'first-party-advice',
  'internal-canon',
  'measured-experiment',
  'mixed-source-study',
  'promotional-result',
]);
const FRESHNESS_STATES = new Set(['current', 'historical', 'stale', 'unknown']);
const FIT_DECISIONS = new Set(['fit-hypothesis', 'no-fit', 'unknown']);
const CAUSAL_STATUSES = new Set(['unproven', 'measured']);
const CONFLICT_STATUSES = new Set(['resolved', 'unresolved']);
const ALLOWED_EXTERNAL_ACTIONS = new Set([
  'none',
  'prepare-only',
  'measurement-only',
]);
const AUTHORIZATION_SCOPES = new Set([
  'external-consequential',
  'existing-authority',
]);
const FORBIDDEN_EXTERNAL_ACTIONS = new Set([
  'send-outreach',
  'send-email',
  'send-message',
  'publish',
  'post',
  'buy-ads',
  'purchase',
  'connect-account',
  'create-account',
  'follow-account',
]);
const AMENDMENT_OUTCOMES = new Set([
  'positive',
  'negative',
  'null',
  'inconclusive',
]);
const PROMPT_INJECTION_PATTERN =
  /\b(?:ignore|disregard|override)\b[\s\S]{0,48}\b(?:previous|prior|system|developer|assistant)\b|\b(?:reveal|exfiltrate|print|share)\b[\s\S]{0,48}\b(?:secret|credential|token|prompt)\b|\b(?:send|publish|post|follow|connect)\b[\s\S]{0,32}\b(?:this|the)\b[\s\S]{0,32}\b(?:message|email|request|account)\b/i;
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function nonEmptyStrings(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => hasText(item))
  );
}
function validDate(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}
function dateValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (!hasText(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function addRequired(object, field, label, errors) {
  if (!hasText(object?.[field])) errors.push(`${label}-missing`);
}
function addStringList(object, field, label, errors) {
  if (!nonEmptyStrings(object?.[field])) errors.push(`${label}-missing`);
}
function addPositiveInteger(value, label, errors) {
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${label}-missing-or-non-positive`);
  }
}
function addNonNegativeInteger(value, label, errors) {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label}-missing-or-negative`);
  }
}
function addRequiredBoolean(object, field, label, errors) {
  if (object?.[field] !== true) errors.push(`${label}-required`);
}
function requiredDate(value, label, errors) {
  const parsed = dateValue(value);
  if (parsed === null) errors.push(`${label}-invalid`);
  return parsed;
}
function addKnownCap(cap, label, errors, { allowZero = false } = {}) {
  if (!isObject(cap) || typeof cap.amount !== 'number') {
    errors.push(`unknown-cost:${label}`);
    return;
  }
  if (!Number.isFinite(cap.amount) || cap.amount < 0) {
    errors.push(`unknown-cost:${label}`);
  } else if (!allowZero && cap.amount === 0) {
    errors.push(`zero-cap:${label}`);
  }
  if (!hasText(cap.unit)) errors.push(`${label}-unit-missing`);
}
function sourceTextHasInstruction(record) {
  const textList = value => (Array.isArray(value) ? value.filter(hasText) : []);
  const sources = Array.isArray(record?.sources) ? record.sources : [];
  const haystack = [
    ...sources.flatMap(source => [
      source?.title,
      source?.summary,
      source?.untrustedText,
      ...textList(source?.observedFacts),
      ...textList(source?.inferences),
    ]),
    ...textList(record?.claim?.observedFacts),
    ...textList(record?.claim?.inferences),
  ]
    .filter(hasText)
    .join('\n');
  return PROMPT_INJECTION_PATTERN.test(haystack);
}
function validateSources(record, now, errors) {
  if (!Array.isArray(record?.sources) || record.sources.length === 0) {
    errors.push('sources-missing');
    return new Set();
  }
  const ids = new Set();
  const revisions = new Set();
  for (const source of record.sources) {
    addRequired(source, 'id', 'source-id', errors);
    addRequired(source, 'ref', 'source-ref', errors);
    addRequired(source, 'title', 'source-title', errors);
    addRequired(source, 'kind', 'source-kind', errors);
    addRequired(source, 'sourceRevision', 'source-revision', errors);
    addRequired(source, 'provenance', 'source-provenance', errors);
    addRequired(source, 'incentiveOrBias', 'source-incentive-or-bias', errors);
    addStringList(source, 'observedFacts', 'source-observed-facts', errors);
    addStringList(source, 'inferences', 'source-inferences', errors);
    if (ids.has(source?.id)) errors.push(`duplicate-evidence:${source.id}`);
    if (hasText(source?.id)) ids.add(source.id);
    const revisionKey = `${source?.ref}\u0000${source?.sourceRevision}`;
    if (hasText(source?.ref) && hasText(source?.sourceRevision)) {
      if (revisions.has(revisionKey)) {
        errors.push(`duplicate-source-revision:${source.sourceRevision}`);
      }
      revisions.add(revisionKey);
    }
    if (
      !hasText(source?.ref) ||
      !/^(?:https?:\/\/|gbrain:|repo:)/i.test(source.ref)
    ) {
      errors.push(`source-ref-unbound:${source?.id || '<missing>'}`);
    }
    if (!validDate(source?.accessedAt)) {
      errors.push(`source-accessed-at-invalid:${source?.id || '<missing>'}`);
    }
    if (source?.publishedAt === null) {
      if (source?.publishedAtKnown !== false) {
        errors.push(`source-published-at-unknown:${source?.id || '<missing>'}`);
      }
      if (!['relative', 'unknown'].includes(source?.publishedAtPrecision)) {
        errors.push(
          `source-published-precision-mismatch:${source?.id || '<missing>'}`
        );
      }
      if (
        source?.publishedAtPrecision === 'relative' &&
        !hasText(source?.publishedAtText)
      ) {
        errors.push(
          `source-published-text-missing:${source?.id || '<missing>'}`
        );
      }
    } else if (!validDate(source?.publishedAt)) {
      errors.push(`source-published-at-invalid:${source?.id || '<missing>'}`);
    } else {
      if (source?.publishedAtKnown !== true) {
        errors.push(
          `source-published-at-known-mismatch:${source?.id || '<missing>'}`
        );
      }
      if (!['day', 'instant'].includes(source?.publishedAtPrecision)) {
        errors.push(
          `source-published-precision-mismatch:${source?.id || '<missing>'}`
        );
      }
    }
    const freshness = source?.freshness;
    if (!isObject(freshness) || !FRESHNESS_STATES.has(freshness.status)) {
      errors.push(`source-freshness-unknown:${source?.id || '<missing>'}`);
    } else {
      const checkedAt = dateValue(freshness.checkedAt);
      if (!validDate(freshness.checkedAt) || checkedAt > now) {
        errors.push(`source-freshness-check-invalid:${source.id}`);
      }
      if (freshness.status === 'stale' || freshness.status === 'unknown') {
        errors.push(`stale-source:${source.id}`);
      }
      if (freshness.status === 'current') {
        if (!Number.isInteger(freshness.ttlDays) || freshness.ttlDays < 0) {
          errors.push(`source-ttl-invalid:${source.id}`);
        } else {
          if (
            checkedAt !== null &&
            now - checkedAt > freshness.ttlDays * 24 * 60 * 60 * 1000
          ) {
            errors.push(`stale-source:${source.id}`);
          }
        }
      }
    }
    if (source?.status !== 'active') {
      errors.push(`source-status-not-active:${source?.id || '<missing>'}`);
    }
    if (source?.duplicateOf !== null && source?.duplicateOf !== undefined) {
      errors.push(`duplicate-evidence:${source.id}`);
    }
  }
  return ids;
}
function validateClaim(record, errors) {
  const claim = record?.claim;
  if (!isObject(claim)) {
    errors.push('claim-missing');
    return;
  }
  addStringList(claim, 'observedFacts', 'observed-facts', errors);
  addStringList(claim, 'inferences', 'inferences', errors);
  addStringList(claim, 'counterevidence', 'counterevidence', errors);
  if (!GROWTH_LEARNING_EVIDENCE_CLASSES.includes(claim.evidenceClass)) {
    errors.push('evidence-class-invalid');
  }
  if (!CAUSAL_STATUSES.has(claim.causalStatus)) {
    errors.push('causal-status-invalid');
  }
  if (claim.causalCertification !== 'not-certified') {
    errors.push('causal-certification-unproven');
  }
  if (
    (claim.evidenceClass === 'promotional-result' ||
      claim.causalStatus === 'measured') &&
    claim.measurementVerified !== true
  ) {
    errors.push('unverified-causal-uplift');
  }
}
function validateFit(record, sourceIds, errors) {
  const fit = record?.fit;
  if (!isObject(fit)) {
    errors.push('fit-missing');
    return;
  }
  addRequired(fit, 'product', 'fit-product', errors);
  addRequired(fit, 'audience', 'fit-audience', errors);
  addRequired(fit, 'painSignal', 'fit-pain-signal', errors);
  addStringList(fit, 'evidenceRefs', 'fit-evidence-refs', errors);
  addStringList(fit, 'disqualifiers', 'fit-disqualifiers', errors);
  if (fit.product !== 'Jovie') errors.push('fit-product-unbound');
  if (!FIT_DECISIONS.has(fit.decision)) errors.push('fit-decision-invalid');
  if (fit.decision === 'no-fit') errors.push('product-fit-rejected');
  if (fit.decision === 'unknown') errors.push('product-fit-unknown');
  for (const sourceId of Array.isArray(fit.evidenceRefs)
    ? fit.evidenceRefs
    : []) {
    if (!sourceIds.has(sourceId))
      errors.push(`fit-evidence-unbound:${sourceId}`);
  }
}
function validateConflicts(record, sourceIds, errors) {
  if (record?.conflicts === undefined) return;
  if (!Array.isArray(record.conflicts)) {
    errors.push('conflicting-source-unknown');
    return;
  }
  for (const conflict of record.conflicts) {
    if (!isObject(conflict)) {
      errors.push('conflicting-source-unknown');
      continue;
    }
    if (!nonEmptyStrings(conflict.sourceIds) || conflict.sourceIds.length < 2) {
      errors.push('conflict-source-ids-missing');
    } else {
      for (const sourceId of conflict.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`conflict-source-unbound:${sourceId}`);
        }
      }
    }
    if (!CONFLICT_STATUSES.has(conflict.status)) {
      errors.push('conflict-status-invalid');
    } else if (conflict.status === 'unresolved') {
      errors.push('conflicting-source');
    } else if (!hasText(conflict.resolution)) {
      errors.push('conflict-resolution-missing');
    }
  }
}
function validateCohortProtocol(proposal, errors) {
  const cohort = proposal?.cohortProtocol;
  if (!isObject(cohort)) {
    errors.push('proposal-cohort-protocol-missing');
    return null;
  }
  const frozenAt = requiredDate(
    cohort.qualifiedCohortFrozenAt,
    'proposal-cohort-frozen-at',
    errors
  );
  const assignmentAt = requiredDate(
    cohort.assignmentAt,
    'proposal-assignment-at',
    errors
  );
  if (frozenAt !== null && assignmentAt !== null && frozenAt > assignmentAt) {
    errors.push('proposal-cohort-frozen-after-assignment');
  }
  const allocation = cohort.allocation;
  if (!isObject(allocation)) errors.push('proposal-allocation-missing');
  else {
    if (allocation.method !== RANDOMIZATION_METHOD) {
      errors.push('proposal-allocation-method-invalid');
    }
    addRequired(allocation, 'seedRef', 'proposal-allocation-seed', errors);
  }
  return assignmentAt;
}
function validateSignalTiming(proposal, assignmentAt, errors) {
  const timing = proposal?.signalTiming;
  if (!isObject(timing)) {
    errors.push('proposal-signal-timing-missing');
    return null;
  }
  const announcementAt = requiredDate(
    timing.announcementAt,
    'proposal-announcement-at',
    errors
  );
  const eventAt = requiredDate(timing.eventAt, 'proposal-event-at', errors);
  if (
    announcementAt !== null &&
    eventAt !== null &&
    announcementAt === eventAt
  ) {
    errors.push('proposal-announcement-and-event-not-distinct');
  }
  if (
    announcementAt !== null &&
    assignmentAt !== null &&
    announcementAt > assignmentAt
  ) {
    errors.push('proposal-announcement-after-assignment');
  }
  if (eventAt !== null && assignmentAt !== null && eventAt < assignmentAt) {
    errors.push('proposal-event-before-assignment');
  }
  if (
    announcementAt !== null &&
    assignmentAt !== null &&
    assignmentAt - announcementAt > SIGNAL_WINDOW_DAYS * DAY_MS
  ) {
    errors.push('proposal-announcement-outside-prior-window');
  }
  if (
    eventAt !== null &&
    assignmentAt !== null &&
    eventAt - assignmentAt > SIGNAL_WINDOW_DAYS * DAY_MS
  ) {
    errors.push('proposal-event-outside-next-window');
  }
}
function validateOutcomeObservation(observation, label, errors) {
  if (!isObject(observation)) {
    errors.push(`${label}-missing`);
    return false;
  }
  if (observation.bothArmsObservable !== true) {
    errors.push(`${label}-both-arms-not-observable`);
  }
  if (!hasText(observation.matchMethod)) {
    errors.push(`${label}-match-method-missing`);
  }
  if (observation.holdoutContacted !== false) {
    errors.push(`${label}-holdout-contacted`);
  }
  for (const [field, suffix] of [
    ['missingnessReportedByArm', 'missingness-by-arm'],
    ['unknownOutcomesAreMissing', 'unknown-outcomes-missing'],
  ])
    addRequiredBoolean(observation, field, `${label}-${suffix}`, errors);
  return true;
}
function validateOutcomeArm(arm, label, errors) {
  if (!isObject(arm)) {
    errors.push(`${label}-missing`);
    return false;
  }
  const assignedValid = Number.isInteger(arm.assigned) && arm.assigned > 0;
  const observedValid = Number.isInteger(arm.observed) && arm.observed >= 0;
  const missingValid = Number.isInteger(arm.missing) && arm.missing >= 0;
  addPositiveInteger(arm.assigned, `${label}-assigned`, errors);
  addNonNegativeInteger(arm.observed, `${label}-observed`, errors);
  addNonNegativeInteger(arm.missing, `${label}-missing`, errors);
  if (
    assignedValid &&
    observedValid &&
    missingValid &&
    arm.observed + arm.missing !== arm.assigned
  ) {
    errors.push(`${label}-accounting-mismatch`);
  }
  if (assignedValid && observedValid && missingValid && arm.observed === 0) {
    errors.push(`${label}-no-observed-outcomes`);
  }
  return assignedValid && observedValid && missingValid;
}
function validateMeasuredOutcomeObservation(measuredOutcome, proposal, errors) {
  const { outcomeObservation } = measuredOutcome;
  if (
    !validateOutcomeObservation(
      outcomeObservation,
      'outcome-observation',
      errors
    )
  ) {
    return;
  }
  const treatment = outcomeObservation.treatment;
  const control = outcomeObservation.control;
  const treatmentValid = validateOutcomeArm(
    treatment,
    'outcome-treatment',
    errors
  );
  const controlValid = validateOutcomeArm(control, 'outcome-control', errors);
  if (
    treatmentValid &&
    treatment.assigned !== proposal?.sampleSize?.treatment
  ) {
    errors.push('outcome-treatment-not-frozen-cohort');
  }
  if (controlValid && control.assigned !== proposal?.sampleSize?.control) {
    errors.push('outcome-control-not-frozen-cohort');
  }
  if (treatmentValid && measuredOutcome.denominator !== treatment.assigned) {
    errors.push('outcome-denominator-not-all-assigned');
  }
  if (
    controlValid &&
    measuredOutcome.comparatorDenominator !== control.assigned
  ) {
    errors.push('comparator-denominator-not-all-assigned');
  }
}
function validateProposal(record, now, errors, { allowExpired = false } = {}) {
  const proposal = record?.proposal;
  if (!isObject(proposal)) {
    errors.push('proposal-missing');
    return;
  }
  if (proposal.status !== 'proposed') errors.push('proposal-status-invalid');
  for (const field of [
    'hypothesis',
    'sourceSignal',
    'audienceRule',
    'comparator',
    'owner',
    'authorizationOwner',
    'authorizationScope',
    'executionAuthority',
    'rollback',
    'decisionWriteback',
  ]) {
    addRequired(proposal, field, `proposal-${field}`, errors);
  }
  for (const field of ['negativeMetrics', 'stopRules', 'dataBoundary']) {
    addStringList(proposal, field, `proposal-${field}`, errors);
  }
  const cohortAssignmentAt = validateCohortProtocol(proposal, errors);
  validateSignalTiming(proposal, cohortAssignmentAt, errors);
  validateOutcomeObservation(
    proposal.outcomeObservation,
    'proposal-outcome-observation',
    errors
  );
  if (!Array.isArray(proposal.externalActions)) {
    errors.push('proposal-external-actions-missing');
  } else {
    for (const action of proposal.externalActions) {
      if (FORBIDDEN_EXTERNAL_ACTIONS.has(action)) {
        errors.push(`forbidden-authority:${action}`);
      } else if (!ALLOWED_EXTERNAL_ACTIONS.has(action)) {
        errors.push(`external-action-unknown:${action}`);
      }
    }
  }
  if (!AUTHORIZATION_SCOPES.has(proposal.authorizationScope)) {
    errors.push('authorization-scope-invalid');
  } else if (proposal.authorizationScope === 'external-consequential') {
    if (proposal.executionAuthority !== 'pending-founder-authorization') {
      errors.push('authority-escalation');
    }
  } else {
    if (proposal.executionAuthority !== 'existing-authority') {
      errors.push('existing-authority-mismatch');
    }
    if (
      Array.isArray(proposal.externalActions) &&
      proposal.externalActions.some(
        action => !['none', 'measurement-only'].includes(action)
      )
    ) {
      errors.push('internal-scope-forbids-external-action');
    }
  }
  addKnownCap(proposal.effortCap, 'effort', errors);
  addKnownCap(proposal.spendCap, 'spend', errors, { allowZero: true });
  const metric = proposal.primaryMetric;
  if (!isObject(metric)) {
    errors.push('primary-metric-missing');
  } else {
    for (const field of ['name', 'numerator', 'denominator']) {
      addRequired(metric, field, `primary-metric-${field}`, errors);
    }
    if (!Number.isInteger(metric.windowDays) || metric.windowDays <= 0) {
      errors.push('primary-metric-window-invalid');
    }
  }
  const effect = proposal.minimumDetectableEffect;
  if (
    !isObject(effect) ||
    !hasText(effect.metric) ||
    typeof effect.absolute !== 'number' ||
    !Number.isFinite(effect.absolute) ||
    effect.absolute <= 0
  ) {
    errors.push('minimum-detectable-effect-missing');
  }
  const sampleSize = proposal.sampleSize;
  if (!isObject(sampleSize)) {
    errors.push('sample-size-missing');
  } else {
    addPositiveInteger(sampleSize.treatment, 'sample-size-treatment', errors);
    addPositiveInteger(sampleSize.control, 'sample-size-control', errors);
    addRequired(sampleSize, 'unit', 'sample-size-unit', errors);
    if (
      !['exploratory-pilot', 'powered-confirmatory'].includes(
        sampleSize.designIntent
      )
    ) {
      errors.push('sample-size-design-intent-invalid');
    }
    if (!['not-powered', 'powered'].includes(sampleSize.powerStatus)) {
      errors.push('sample-size-power-status-invalid');
    }
    if (
      sampleSize.designIntent === 'exploratory-pilot' &&
      sampleSize.powerStatus !== 'not-powered'
    ) {
      errors.push('exploratory-pilot-claims-powered');
    }
    if (
      sampleSize.designIntent === 'powered-confirmatory' &&
      sampleSize.powerStatus !== 'powered'
    ) {
      errors.push('confirmatory-pilot-not-powered');
    }
  }
  for (const [field, label] of [
    ['expiresAt', 'proposal-expiry'],
    ['outcomeReviewAt', 'proposal-outcome-review'],
  ]) {
    if (!validDate(proposal[field])) errors.push(`${label}-invalid`);
  }
  const expiresAt = dateValue(proposal.expiresAt);
  const outcomeReviewAt = dateValue(proposal.outcomeReviewAt);
  if (
    expiresAt !== null &&
    cohortAssignmentAt !== null &&
    cohortAssignmentAt >= expiresAt
  ) {
    errors.push('proposal-assignment-after-expiry');
  }
  if (!allowExpired && expiresAt !== null && expiresAt <= now) {
    errors.push('proposal-expired');
  }
  if (
    expiresAt !== null &&
    outcomeReviewAt !== null &&
    outcomeReviewAt < expiresAt
  ) {
    errors.push('proposal-review-before-expiry');
  }
  if (
    expiresAt !== null &&
    outcomeReviewAt !== null &&
    outcomeReviewAt < expiresAt + RETAINED_USE_DAYS * DAY_MS
  ) {
    errors.push('proposal-review-before-retention-window');
  }
  if (
    outcomeReviewAt !== null &&
    outcomeReviewAt < dateValue(GROWTH_LEARNING_RETENTION_REVIEW_FLOOR)
  ) {
    errors.push('proposal-review-before-retention-floor');
  }
}
function baseResult(errors, warnings = []) {
  return {
    ok: errors.length === 0,
    eligible: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
export function evaluateGrowthLearning(
  record,
  { now = new Date(), allowExpiredProposal = false } = {}
) {
  const errors = [];
  const warnings = [];
  const nowValue = dateValue(now);
  if (nowValue === null) errors.push('evaluation-time-invalid');
  if (!isObject(record)) {
    return {
      ...baseResult(['learning-record-missing']),
      causalCertification: 'not-certified',
      nextAction: 'preserve-and-reject',
    };
  }
  const requiresFounderAuthorization =
    record.proposal?.authorizationScope === 'external-consequential';
  if (record.schemaVersion !== GROWTH_LEARNING_SCHEMA) {
    errors.push('schema-version-invalid');
  }
  addRequired(record, 'id', 'learning-id', errors);
  if (!GROWTH_LEARNING_PHASES.includes(record.phase)) {
    errors.push('learning-phase-invalid');
  }
  if (!validDate(record.assessedAt)) errors.push('assessed-at-invalid');
  const sourceIds = validateSources(record, nowValue ?? Date.now(), errors);
  validateClaim(record, errors);
  validateFit(record, sourceIds, errors);
  validateConflicts(record, sourceIds, errors);
  validateProposal(record, nowValue ?? Date.now(), errors, {
    allowExpired: allowExpiredProposal,
  });
  if (sourceTextHasInstruction(record)) {
    errors.push('source-prompt-injection');
  }
  const claim = record.claim;
  if (claim?.causalStatus === 'unproven') {
    warnings.push('causal-uplift-unproven');
  }
  const result = baseResult(errors, warnings);
  return {
    ...result,
    causalCertification: result.ok ? 'not-certified' : 'blocked',
    nextAction: result.ok
      ? requiresFounderAuthorization
        ? 'hold-for-founder-authorization'
        : 'proceed-under-existing-authority'
      : 'preserve-and-reject',
  };
}
export function evaluateInvariantAmendment(
  record,
  amendment = record?.amendment,
  { now = new Date() } = {}
) {
  const base = evaluateGrowthLearning(record, {
    now,
    allowExpiredProposal: true,
  });
  const errors = [...base.errors];
  const measuredOutcome = amendment?.measuredOutcome;
  let preserveEvidence = true;
  if (!isObject(amendment) || amendment.status !== 'proposed') {
    return {
      ok: base.ok,
      adoptable: false,
      adoption: 'not-proposed',
      errors,
      preserveEvidence,
    };
  }
  addStringList(amendment, 'scope', 'amendment-scope', errors);
  addRequired(amendment, 'sourceRevision', 'amendment-source-revision', errors);
  addRequired(amendment, 'rollback', 'amendment-rollback', errors);
  addRequired(amendment, 'reviewAt', 'amendment-review', errors);
  if (amendment.compatibilityCheck !== 'pass') {
    errors.push('amendment-compatibility-failed');
  }
  const conflictsWithValid =
    Array.isArray(amendment.conflictsWith) &&
    amendment.conflictsWith.every(hasText);
  if (!conflictsWithValid) {
    errors.push('amendment-conflicts-invalid');
  }
  if (
    amendment.conflictCheck !== 'pass' ||
    !conflictsWithValid ||
    amendment.conflictsWith.length
  ) {
    errors.push('conflicting-amendment');
  }
  if (!validDate(amendment.reviewAt)) errors.push('amendment-review-invalid');
  if (!isObject(measuredOutcome) || measuredOutcome.state !== 'measured') {
    errors.push('measured-outcome-unknown');
  } else {
    if (measuredOutcome.verified !== true) {
      errors.push('measured-outcome-unverified');
    }
    if (!AMENDMENT_OUTCOMES.has(measuredOutcome.result)) {
      errors.push('measured-outcome-result-invalid');
    }
    validateMeasuredOutcomeObservation(
      measuredOutcome,
      record?.proposal,
      errors
    );
    for (const [field, label] of [
      ['denominator', 'outcome-denominator'],
      ['comparatorDenominator', 'comparator-denominator'],
    ]) {
      addPositiveInteger(measuredOutcome[field], label, errors);
    }
    if (!Number.isFinite(measuredOutcome.lift)) {
      errors.push('measured-outcome-lift-missing');
    }
    addRequired(
      measuredOutcome,
      'sourceRevision',
      'outcome-source-revision',
      errors
    );
    addRequired(measuredOutcome, 'receiptRef', 'outcome-receipt', errors);
    if (
      hasText(amendment.sourceRevision) &&
      hasText(measuredOutcome.sourceRevision) &&
      amendment.sourceRevision !== measuredOutcome.sourceRevision
    ) {
      errors.push('amendment-source-revision-mismatch');
    }
    if (
      measuredOutcome.result === 'negative' ||
      measuredOutcome.result === 'null' ||
      measuredOutcome.result === 'inconclusive'
    ) {
      errors.push('negative-or-null-outcome');
    }
    const minimumEffect = record?.proposal?.minimumDetectableEffect?.absolute;
    if (
      measuredOutcome.result === 'positive' &&
      typeof minimumEffect === 'number' &&
      measuredOutcome.lift < minimumEffect
    ) {
      errors.push('measured-effect-below-mde');
    }
    const reviewAt = dateValue(amendment.reviewAt);
    const assignmentAt = dateValue(
      record?.proposal?.cohortProtocol?.assignmentAt
    );
    const lastEligibleActivationAt = dateValue(
      measuredOutcome.lastEligibleActivationAt
    );
    const evaluationAt = dateValue(now) ?? Date.now();
    if (assignmentAt !== null && assignmentAt > evaluationAt) {
      errors.push('amendment-assignment-not-due');
    }
    if (
      lastEligibleActivationAt === null ||
      lastEligibleActivationAt > evaluationAt
    ) {
      errors.push('last-eligible-activation-invalid');
    }
    if (
      assignmentAt !== null &&
      lastEligibleActivationAt !== null &&
      lastEligibleActivationAt < assignmentAt
    ) {
      errors.push('last-eligible-activation-before-assignment');
    }
    if (reviewAt !== null && evaluationAt < reviewAt) {
      errors.push('amendment-review-not-due');
    }
    if (
      reviewAt !== null &&
      reviewAt < dateValue(GROWTH_LEARNING_RETENTION_REVIEW_FLOOR)
    ) {
      errors.push('amendment-review-before-retention-floor');
    }
    const proposalReviewAt = dateValue(record?.proposal?.outcomeReviewAt);
    if (
      reviewAt !== null &&
      proposalReviewAt !== null &&
      reviewAt < proposalReviewAt
    ) {
      errors.push('amendment-review-before-proposal-review');
    }
    if (
      reviewAt !== null &&
      lastEligibleActivationAt !== null &&
      reviewAt < lastEligibleActivationAt + RETAINED_USE_DAYS * DAY_MS
    ) {
      errors.push('amendment-review-before-retention-window');
    }
    if (
      lastEligibleActivationAt !== null &&
      evaluationAt < lastEligibleActivationAt + RETAINED_USE_DAYS * DAY_MS
    ) {
      errors.push('amendment-retention-not-observed');
    }
  }
  if (errors.length > 0) {
    const adoption = errors.includes('negative-or-null-outcome')
      ? 'rejected-evidence-preserved'
      : errors.includes('conflicting-amendment')
        ? 'rejected-conflict'
        : 'unknown-evidence-preserved';
    return {
      ok: false,
      adoptable: false,
      adoption,
      errors: [...new Set(errors)],
      preserveEvidence,
    };
  }
  preserveEvidence = false;
  return {
    ok: true,
    adoptable: true,
    adoption: 'scoped-reversible-amendment-eligible',
    errors: [],
    preserveEvidence,
  };
}

/**
 * Evidence-bound public growth learning contract.
 *
 * Invariant consumer: JOV-INV-028.
 * This module validates research records and experiment proposals. It never
 * fetches sources, sends outreach, changes a product policy, or authorizes
 * external work. Founder authorization is required only for proposals scoped
 * as external-consequential; existing authority carries through for internal
 * evidence work and reversible implementation.
 */

export const GROWTH_LEARNING_INVARIANT_ID = 'JOV-INV-028';
export const GROWTH_LEARNING_SCHEMA = 'jovie-growth-learning/v1';

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
    return [];
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
    if (revisions.has(source?.sourceRevision)) {
      errors.push(`duplicate-source-revision:${source.sourceRevision}`);
    }
    if (hasText(source?.sourceRevision)) revisions.add(source.sourceRevision);

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
      if (!validDate(freshness.checkedAt)) {
        errors.push(`source-freshness-check-invalid:${source.id}`);
      }
      if (freshness.status === 'stale' || freshness.status === 'unknown') {
        errors.push(`stale-source:${source.id}`);
      }
      if (freshness.status === 'current') {
        if (!Number.isInteger(freshness.ttlDays) || freshness.ttlDays < 0) {
          errors.push(`source-ttl-invalid:${source.id}`);
        } else {
          const checkedAt = dateValue(freshness.checkedAt);
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
  for (const sourceId of fit.evidenceRefs || []) {
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

function validateProposal(record, now, errors) {
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
  if (expiresAt !== null && expiresAt <= now) errors.push('proposal-expired');
  if (
    expiresAt !== null &&
    outcomeReviewAt !== null &&
    outcomeReviewAt < expiresAt
  ) {
    errors.push('proposal-review-before-expiry');
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

/**
 * Validate a source-backed learning record and its bounded proposal.
 * `now` is injectable so the expiry and freshness gates stay deterministic.
 */
export function evaluateGrowthLearning(record, { now = new Date() } = {}) {
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
  validateProposal(record, nowValue ?? Date.now(), errors);

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

/**
 * Check whether a measured result may propose a scoped invariant amendment.
 * Negative, null, stale, conflicting, or under-specified results remain
 * visible as evidence but can never be adopted.
 */
export function evaluateInvariantAmendment(
  record,
  amendment = record?.amendment,
  { now = new Date() } = {}
) {
  const base = evaluateGrowthLearning(record, { now });
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
  if (
    amendment.conflictCheck !== 'pass' ||
    (Array.isArray(amendment.conflictsWith) && amendment.conflictsWith.length)
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

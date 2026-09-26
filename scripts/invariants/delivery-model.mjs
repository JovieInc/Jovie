// JOV-INV-035: sell the outcome first; delivery model is a competing
// implementation. The invariant registry is the authority; this validator
// binds its policy contract and validates DeliveryModelHypothesis records so
// service, productized-service, managed-autonomous, self-serve, API, license,
// and hybrid modes compare on one capability without a new platform.

export const DELIVERY_MODEL_INVARIANT_ID = 'JOV-INV-035';
export const DELIVERY_MODEL_SCHEMA = 'jovie-delivery-model/v1';
export const DELIVERY_MODEL_HYPOTHESIS_SCHEMA =
  'jovie-delivery-model-hypothesis/v1';

export const DELIVERY_MODES = Object.freeze([
  'concierge-service',
  'productized-service',
  'managed-autonomous-service',
  'self-serve-software',
  'api-cli-mcp',
  'license-partner',
  'hybrid',
]);

export const PRODUCTIZATION_TRIGGERS = Object.freeze([
  'repeats-across-qualified-customers',
  'material-bottleneck',
  'certifiable-agent-or-software-advantage',
  'customer-requests-direct-control',
  'standardization-preserves-value',
  'creates-reusable-leverage',
]);

export const HYPOTHESIS_STATUSES = Object.freeze([
  'exploring',
  'testing',
  'sold',
  'delivering',
  'delivered',
  'stopped',
]);

const SOLD_STATUSES = new Set(['sold', 'delivering', 'delivered']);
const PAYMENT_EVIDENCE_STATES = new Set([
  'none',
  'commitment',
  'paid',
  'retained',
  'expanded',
]);
const CANARY_STATES = new Set(['pending', 'passed', 'failed']);

const REQUIRED_OUTCOME_FIELDS = Object.freeze([
  'buyer',
  'job',
  'promisedOutcome',
  'successPredicate',
  'timeToValue',
]);

const REQUIRED_OBLIGATION_FIELDS = Object.freeze([
  'scope',
  'quality',
  'timing',
  'payment',
  'refund',
  'completionState',
]);

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

function sameSet(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every(item => right.includes(item))
  );
}

export function deliveryModelPolicy(registry) {
  return registry?.invariants?.find(
    item => item?.id === DELIVERY_MODEL_INVARIANT_ID
  )?.policy?.value;
}

export function validateDeliveryModelPolicy(registry) {
  const errors = [];
  const contract = deliveryModelPolicy(registry);
  if (!contract) {
    return [`delivery-model-contract-missing: ${DELIVERY_MODEL_INVARIANT_ID}`];
  }
  if (contract.schema !== DELIVERY_MODEL_SCHEMA) {
    errors.push(`delivery-model-schema: expected ${DELIVERY_MODEL_SCHEMA}`);
  }
  if (contract.outcomeBeforeSurface !== true) {
    errors.push('delivery-model-outcome-first-required');
  }
  if (contract.automationRequiresCanary !== true) {
    errors.push('delivery-model-automation-canary-required');
  }
  if (!sameSet(contract.deliveryModes, DELIVERY_MODES)) {
    errors.push('delivery-model-modes-incomplete');
  }
  if (!sameSet(contract.productizationTriggers, PRODUCTIZATION_TRIGGERS)) {
    errors.push('delivery-model-triggers-incomplete');
  }
  for (const field of REQUIRED_OUTCOME_FIELDS) {
    if (!contract.requiredOutcomeFields?.includes(field)) {
      errors.push(`delivery-model-outcome-field-missing:${field}`);
    }
  }
  for (const field of REQUIRED_OBLIGATION_FIELDS) {
    if (!contract.fulfillmentObligationFields?.includes(field)) {
      errors.push(`delivery-model-obligation-field-missing:${field}`);
    }
  }
  if (!nonEmptyStrings(contract.decisionCriteria)) {
    errors.push('delivery-model-decision-criteria-missing');
  }
  return errors;
}

export function validateDeliveryModelHypothesis(
  record,
  contract = deliveryModelPolicy(undefined)
) {
  const errors = [];
  const modes = contract?.deliveryModes ?? DELIVERY_MODES;
  const triggers = contract?.productizationTriggers ?? PRODUCTIZATION_TRIGGERS;
  if (!isObject(record)) {
    return ['hypothesis-missing'];
  }
  if (record.schema !== DELIVERY_MODEL_HYPOTHESIS_SCHEMA) {
    errors.push(
      `hypothesis-schema: expected ${DELIVERY_MODEL_HYPOTHESIS_SCHEMA}`
    );
  }
  const outcome = record.outcome;
  if (!isObject(outcome)) {
    errors.push('outcome-missing');
  } else {
    for (const field of REQUIRED_OUTCOME_FIELDS) {
      if (!hasText(outcome[field])) errors.push(`outcome-${field}-missing`);
    }
  }
  if (hasText(record.proposedSurface) && !isObject(outcome)) {
    errors.push('surface-before-outcome');
  }
  if (!modes.includes(record.currentMode)) {
    errors.push(`current-mode-unknown:${record.currentMode ?? '<missing>'}`);
  }
  if (!nonEmptyStrings(record.candidateModes)) {
    errors.push('candidate-modes-missing');
  } else {
    for (const mode of record.candidateModes) {
      if (!modes.includes(mode)) errors.push(`candidate-mode-unknown:${mode}`);
    }
  }
  if (!HYPOTHESIS_STATUSES.includes(record.status)) {
    errors.push(`status-unknown:${record.status ?? '<missing>'}`);
  }
  const evidence = record.evidence;
  if (!isObject(evidence)) {
    errors.push('evidence-missing');
  } else {
    if (!nonEmptyStrings(evidence.demandEvidence)) {
      errors.push('demand-evidence-missing');
    }
    if (!PAYMENT_EVIDENCE_STATES.has(evidence.paymentEvidence)) {
      errors.push('payment-evidence-unknown');
    }
  }
  const economics = record.economics;
  if (!isObject(economics)) {
    errors.push('economics-missing');
  } else {
    if (
      typeof economics.fullyLoadedVariableCost !== 'number' ||
      !Number.isFinite(economics.fullyLoadedVariableCost) ||
      economics.fullyLoadedVariableCost < 0
    ) {
      errors.push('economics-variable-cost-unknown');
    }
    if (
      typeof economics.contributionMargin !== 'number' ||
      !Number.isFinite(economics.contributionMargin)
    ) {
      errors.push('economics-contribution-margin-unknown');
    }
    if (!hasText(economics.cashTiming)) {
      errors.push('economics-cash-timing-missing');
    }
  }
  if (!hasText(record.owner)) errors.push('owner-missing');
  if (SOLD_STATUSES.has(record.status)) {
    const obligation = record.fulfillmentObligation;
    if (!isObject(obligation)) {
      errors.push('fulfillment-obligation-missing');
    } else {
      for (const field of REQUIRED_OBLIGATION_FIELDS) {
        if (!hasText(obligation[field])) {
          errors.push(`fulfillment-obligation-${field}-missing`);
        }
      }
    }
  }
  for (const candidate of Array.isArray(record.automationCandidates)
    ? record.automationCandidates
    : []) {
    if (!hasText(candidate?.step)) {
      errors.push('automation-candidate-step-missing');
      continue;
    }
    if (!nonEmptyStrings(candidate.triggers)) {
      errors.push(`automation-trigger-missing:${candidate.step}`);
    } else {
      for (const trigger of candidate.triggers) {
        if (!triggers.includes(trigger)) {
          errors.push(`automation-trigger-unknown:${trigger}`);
        }
      }
    }
    if (!hasText(candidate.measurableHypothesis)) {
      errors.push(`automation-hypothesis-missing:${candidate.step}`);
    }
    if (candidate.status === 'automated') {
      if (candidate.canary?.status !== 'passed') {
        errors.push(`automation-without-canary:${candidate.step}`);
      }
    } else if (!CANARY_STATES.has(candidate?.canary?.status ?? 'pending')) {
      errors.push(`automation-canary-unknown:${candidate.step}`);
    }
  }
  const experiment = record.nextExperiment;
  if (!isObject(experiment)) {
    errors.push('next-experiment-missing');
  } else {
    for (const field of ['description', 'successThreshold', 'killThreshold']) {
      if (!hasText(experiment[field])) {
        errors.push(`next-experiment-${field}-missing`);
      }
    }
  }
  return errors;
}

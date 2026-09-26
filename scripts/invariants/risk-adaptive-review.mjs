// JOV-INV-036: risk-adaptive execution chooses the least expensive safe path
// to certified production. The invariant registry is the authority; this
// validator binds its policy contract, selects the review topology for a work
// item, and validates durable decision receipts so review strength is a
// function of expected cost — never a hard-coded model or an arbitrary rule.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RISK_ADAPTIVE_INVARIANT_ID = 'JOV-INV-036';
export const RISK_ADAPTIVE_SCHEMA = 'jovie-risk-adaptive-review/v1';
export const DECISION_RECEIPT_SCHEMA = 'jovie-review-decision-receipt/v1';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const REVIEW_TOPOLOGIES = Object.freeze([
  'none',
  'postflight',
  'plan-critique',
  'bounded-spike',
  'deliberate-red-prototype',
  'independent-preflight',
  'preflight-and-postflight',
]);

// Topologies where independent critique lands before implementation.
const PREFLIGHT_TOPOLOGIES = new Set([
  'independent-preflight',
  'preflight-and-postflight',
]);

// Topologies requiring more than implement-then-certify.
const STRENGTHENED_TOPOLOGIES = new Set([
  'plan-critique',
  'bounded-spike',
  'deliberate-red-prototype',
  'independent-preflight',
  'preflight-and-postflight',
]);

export const FIXTURE_CLASSES = Object.freeze([
  'trivial-copy-fix',
  'isolated-reversible-ui-fix',
  'connector-adapter',
  'canonical-certification-inbox',
  'database-migration',
  'security-boundary',
  'revenue-emergency',
]);

const PREFLIGHT_WORK_CLASSES = new Set([
  'shared-primitive',
  'authority-boundary',
  'canonical-schema',
  'irreversible-migration',
  'canonical-certification-inbox',
]);

const HIGH_DAMAGE_RISK_FIELDS = [
  'securityRisk',
  'financialRisk',
  'legalRisk',
  'dataIntegrityRisk',
  'productionRisk',
];

// Model/provider names are banned from policies and receipts: review strength
// is expressed as capabilities plus independence, and provider availability
// resolves through the JOV-5917 capability registry.
const MODEL_NAME_PATTERN =
  /\b(gpt|claude|opus|sonnet|gemini|grok|kimi|codex|frontier|openai|anthropic|deepseek|qwen|llama|mistral)[\w.-]*/i;

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

export function riskAdaptivePolicy(registry) {
  return registry?.invariants?.find(
    item => item?.id === RISK_ADAPTIVE_INVARIANT_ID
  )?.policy?.value;
}

export function validateRiskAdaptiveReviewPolicy(registry) {
  const errors = [];
  const contract = riskAdaptivePolicy(registry);
  if (!contract) {
    return [`risk-adaptive-contract-missing: ${RISK_ADAPTIVE_INVARIANT_ID}`];
  }
  if (contract.schema !== RISK_ADAPTIVE_SCHEMA) {
    errors.push(`risk-adaptive-schema: expected ${RISK_ADAPTIVE_SCHEMA}`);
  }
  if (
    contract.decisionRule?.objective !==
    'least-expensive-safe-path-to-certified-production'
  ) {
    errors.push('risk-adaptive-objective-invalid');
  }
  for (const term of [
    'review-cost',
    'implementation-cost',
    'verification-cost',
    'wrong-direction-rework',
    'delay-opportunity-cost',
    'failure-externality',
  ]) {
    if (!contract.decisionRule?.expectedTotalCostTerms?.includes(term)) {
      errors.push(`risk-adaptive-cost-term-missing:${term}`);
    }
  }
  if (contract.decisionRule?.unknownInputsIncreaseUncertainty !== true) {
    errors.push('risk-adaptive-unknown-inputs-must-raise-uncertainty');
  }
  if (contract.decisionRule?.neverSilentZero !== true) {
    errors.push('risk-adaptive-unknown-inputs-silent-zero');
  }
  if (!nonEmptyStrings(contract.riskInputs)) {
    errors.push('risk-adaptive-risk-inputs-missing');
  }
  if (!sameSet(contract.reviewTopologies, REVIEW_TOPOLOGIES)) {
    errors.push('risk-adaptive-topologies-incomplete');
  }
  for (const topology of PREFLIGHT_TOPOLOGIES) {
    const requirement = contract.topologyRequirements?.[topology];
    if (!nonEmptyStrings(requirement?.capabilities)) {
      errors.push(`risk-adaptive-capabilities-missing:${topology}`);
    }
    if (requirement?.independence !== 'separate-reviewer') {
      errors.push(`risk-adaptive-independence-required:${topology}`);
    }
    if (
      typeof requirement?.timing !== 'string' ||
      !requirement.timing.startsWith('before')
    ) {
      errors.push(`risk-adaptive-timing-required:${topology}`);
    }
  }
  for (const [topology, requirement] of Object.entries(
    contract.topologyRequirements ?? {}
  )) {
    if (!REVIEW_TOPOLOGIES.includes(topology)) {
      errors.push(`risk-adaptive-topology-unknown:${topology}`);
    }
    if (MODEL_NAME_PATTERN.test(JSON.stringify(requirement))) {
      errors.push(`risk-adaptive-model-name-banned:${topology}`);
    }
  }
  if (!sameSet(contract.fixtureClasses, FIXTURE_CLASSES)) {
    errors.push('risk-adaptive-fixture-classes-incomplete');
  }
  if (contract.providerAvailability !== 'JOV-5917') {
    errors.push('risk-adaptive-provider-availability-must-route-JOV-5917');
  }
  if (contract.receiptSchema !== DECISION_RECEIPT_SCHEMA) {
    errors.push('risk-adaptive-receipt-schema-invalid');
  }
  const calibration = contract.calibration;
  if (
    !sameSet(calibration?.updateInputs, [
      'actualReviewCost',
      'reworkAvoided',
      'defectsCaught',
      'falseEscalations',
      'delayImposed',
    ]) ||
    calibration?.thresholdMutable !== true
  ) {
    errors.push('risk-adaptive-calibration-incomplete');
  }
  if (
    contract.costAccounting?.certifiedProductionCostSeparateFromTokenSpend !==
    true
  ) {
    errors.push('risk-adaptive-cost-accounting-invalid');
  }
  const inbox = contract.certificationInbox;
  if (inbox?.requiredTopology !== 'independent-preflight') {
    errors.push('risk-adaptive-certification-inbox-topology-invalid');
  }
  if (!hasText(inbox?.receipt)) {
    errors.push('risk-adaptive-certification-inbox-receipt-missing');
  }
  return errors;
}

// Deterministic review-topology selection over the declared risk inputs.
// `inputs.workClass` and the risk fields come from the work item; unknown
// material inputs must already be surfaced in `inputs.uncertainties` — they
// strengthen, never weaken, the selected topology.
export function selectReviewTopology(inputs, contract) {
  if (!isObject(inputs)) return 'independent-preflight';
  const policy = contract ?? {};
  const topologies = policy.reviewTopologies ?? REVIEW_TOPOLOGIES;
  const pick = topology => (topologies.includes(topology) ? topology : 'none');
  const highDamage = HIGH_DAMAGE_RISK_FIELDS.some(
    field => inputs[field] === 'high'
  );
  const preflightClass =
    PREFLIGHT_WORK_CLASSES.has(inputs.workClass) ||
    inputs.blastRadius === 'system-wide' ||
    inputs.reversibility === 'irreversible' ||
    inputs.authorityBoundary === true ||
    inputs.canonicalSchema === true;
  if (preflightClass) {
    return pick(
      highDamage ? 'preflight-and-postflight' : 'independent-preflight'
    );
  }
  if (inputs.delayCritical === true) {
    return pick('postflight');
  }
  const medium =
    inputs.blastRadius === 'medium' ||
    inputs.novelty === 'medium' ||
    inputs.ambiguity === 'medium' ||
    inputs.precedentStrength === 'weak' ||
    (Array.isArray(inputs.uncertainties) && inputs.uncertainties.length > 0);
  if (medium) {
    if (inputs.prototypeCheaperThanPlan === true) {
      return pick(
        inputs.defectsDetectable === true
          ? 'deliberate-red-prototype'
          : 'bounded-spike'
      );
    }
    return pick('plan-critique');
  }
  if (
    inputs.blastRadius === 'low' &&
    inputs.reversibility === 'reversible' &&
    inputs.tested === true
  ) {
    return pick('postflight');
  }
  return pick('postflight');
}

export function readDecisionReceipt(path, repoRoot = DEFAULT_REPO_ROOT) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
}

// Validate a durable decision receipt against the versioned policy.
export function validateDecisionReceipt(receipt, contract) {
  const errors = [];
  const policy = contract ?? {};
  if (!isObject(receipt)) return ['receipt-missing'];
  if (receipt.schema !== DECISION_RECEIPT_SCHEMA) {
    errors.push(`receipt-schema: expected ${DECISION_RECEIPT_SCHEMA}`);
  }
  for (const field of ['id', 'workItem', 'decidedAt', 'rationale']) {
    if (!hasText(receipt[field])) errors.push(`receipt-${field}-missing`);
  }
  if (receipt.policyRef?.key !== 'execution.risk-adaptive-review.contract') {
    errors.push('receipt-policy-ref-invalid');
  }
  if (!Number.isInteger(receipt.policyRef?.policyVersion)) {
    errors.push('receipt-policy-version-missing');
  }
  const topology = receipt.chosenTopology;
  if (!REVIEW_TOPOLOGIES.includes(topology)) {
    errors.push(`receipt-topology-unknown:${topology ?? '<missing>'}`);
  }
  const riskInputs = receipt.riskInputs;
  if (!isObject(riskInputs) || Object.keys(riskInputs).length === 0) {
    errors.push('receipt-risk-inputs-missing');
  } else {
    const unknowns = Object.entries(riskInputs)
      .filter(([, value]) => value === 'unknown')
      .map(([key]) => key);
    const uncertainties = Array.isArray(receipt.uncertainties)
      ? receipt.uncertainties
      : [];
    for (const key of unknowns) {
      if (!uncertainties.includes(key)) {
        errors.push(`receipt-uncertainty-not-declared:${key}`);
      }
    }
  }
  if (!nonEmptyStrings(receipt.capabilityRequirements)) {
    errors.push('receipt-capability-requirements-missing');
  }
  if (
    PREFLIGHT_TOPOLOGIES.has(topology) &&
    receipt.independenceConstraint !== 'separate-reviewer'
  ) {
    errors.push('receipt-independence-required');
  }
  if (receipt.independenceConstraint === 'self-review') {
    errors.push('receipt-self-certification-banned');
  }
  if (STRENGTHENED_TOPOLOGIES.has(topology)) {
    if (
      !Array.isArray(receipt.alternativesConsidered) ||
      receipt.alternativesConsidered.length < 2
    ) {
      errors.push('receipt-alternatives-missing');
    }
    for (const field of [
      'existingPrimitives',
      'collisionRisks',
      'smallestCorrectSeam',
    ]) {
      if (!nonEmptyStrings(receipt[field])) {
        errors.push(`receipt-${field}-missing`);
      }
    }
  }
  const outcome = receipt.outcome;
  if (outcome !== undefined) {
    if (!isObject(outcome)) {
      errors.push('receipt-outcome-invalid');
    } else {
      for (const field of [
        'actualReviewCost',
        'reworkAvoided',
        'defectsCaught',
        'falseEscalations',
        'delayImposed',
      ]) {
        if (
          typeof outcome[field] !== 'number' ||
          !Number.isFinite(outcome[field])
        ) {
          errors.push(`receipt-outcome-${field}-missing`);
        }
      }
      if (outcome.feedsCalibration !== true) {
        errors.push('receipt-outcome-not-calibrated');
      }
    }
  }
  if (MODEL_NAME_PATTERN.test(JSON.stringify(receipt.capabilityRequirements))) {
    errors.push('receipt-model-name-banned');
  }
  // A receipt that satisfies the policy must match the deterministic
  // selection for the declared inputs.
  if (errors.length === 0) {
    const expected = selectReviewTopology(
      { workItem: receipt.workItem, ...riskInputs },
      policy
    );
    if (topology !== expected) {
      errors.push(`receipt-topology-mismatch: expected ${expected}`);
    }
  }
  return errors;
}

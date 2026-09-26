import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DELIVERY_MODEL_HYPOTHESIS_SCHEMA,
  validateDeliveryModelHypothesis,
  validateDeliveryModelPolicy,
} from './delivery-model.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();

function contract() {
  return canonical.invariants.find(item => item.id === 'JOV-INV-035').policy
    .value;
}

function healthyHypothesis() {
  return {
    schema: DELIVERY_MODEL_HYPOTHESIS_SCHEMA,
    status: 'sold',
    currentMode: 'concierge-service',
    candidateModes: ['productized-service', 'managed-autonomous-service'],
    outcome: {
      buyer: 'independent musician',
      job: 'turn a release into paid fan actions',
      promisedOutcome: 'a live release page that converts listeners',
      successPredicate: 'fan completes a measurable action',
      timeToValue: '48 hours',
    },
    evidence: {
      demandEvidence: ['two paid pilot requests'],
      paymentEvidence: 'paid',
    },
    economics: {
      fullyLoadedVariableCost: 40,
      contributionMargin: 60,
      cashTiming: 'paid upfront',
    },
    fulfillmentObligation: {
      scope: 'one release page',
      quality: 'matches approved preview',
      timing: '48 hours',
      payment: 'collected before work starts',
      refund: 'full refund if not delivered',
      completionState: 'delivered',
    },
    owner: 'Summer',
    automationCandidates: [
      {
        step: 'page assembly',
        triggers: ['repeats-across-qualified-customers'],
        measurableHypothesis: 'cuts fulfillment minutes per order',
        status: 'candidate',
        canary: { status: 'pending' },
      },
    ],
    nextExperiment: {
      description: 'sell three more concierge deliveries',
      successThreshold: 'three paid orders in 30 days',
      killThreshold: 'zero paid orders in 30 days',
    },
  };
}

describe('JOV-INV-035 outcome-first delivery model', () => {
  it('accepts the canonical delivery-model policy', () => {
    assert.deepEqual(validateDeliveryModelPolicy(canonical), []);
  });

  it('accepts a complete outcome-first hypothesis', () => {
    assert.deepEqual(
      validateDeliveryModelHypothesis(healthyHypothesis(), contract()),
      []
    );
  });

  it('deliberate red: rejects a hypothesis that names a surface before an outcome', () => {
    const record = healthyHypothesis();
    delete record.outcome;
    record.proposedSurface = 'self-serve dashboard';
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(errors.includes('outcome-missing'));
    assert.ok(errors.includes('surface-before-outcome'));
  });

  it('deliberate red: rejects unknown delivery modes', () => {
    const record = healthyHypothesis();
    record.currentMode = 'saas-because-saas';
    record.candidateModes = ['telepathy'];
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(errors.some(error => error.startsWith('current-mode-unknown:')));
    assert.ok(
      errors.some(error => error.startsWith('candidate-mode-unknown:'))
    );
  });

  it('deliberate red: rejects a sold outcome without a fulfillment obligation', () => {
    const record = healthyHypothesis();
    delete record.fulfillmentObligation;
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(errors.includes('fulfillment-obligation-missing'));
  });

  it('deliberate red: rejects automation promoted without a passed canary', () => {
    const record = healthyHypothesis();
    record.automationCandidates[0].status = 'automated';
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(
      errors.some(error => error.startsWith('automation-without-canary:'))
    );
  });

  it('deliberate red: rejects an automation candidate without a named trigger', () => {
    const record = healthyHypothesis();
    record.automationCandidates[0].triggers = ['looks-like-a-software-company'];
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(
      errors.some(error => error.startsWith('automation-trigger-unknown:'))
    );
  });

  it('deliberate red: rejects economics that omit fully loaded cost', () => {
    const record = healthyHypothesis();
    delete record.economics.fullyLoadedVariableCost;
    const errors = validateDeliveryModelHypothesis(record, contract());
    assert.ok(errors.includes('economics-variable-cost-unknown'));
  });

  it('deliberate red: rejects a policy that drops a delivery mode', () => {
    const registry = structuredClone(canonical);
    const policy = registry.invariants.find(item => item.id === 'JOV-INV-035')
      .policy.value;
    policy.deliveryModes = policy.deliveryModes.filter(
      mode => mode !== 'concierge-service'
    );
    assert.ok(
      validateDeliveryModelPolicy(registry).includes(
        'delivery-model-modes-incomplete'
      )
    );
  });
});

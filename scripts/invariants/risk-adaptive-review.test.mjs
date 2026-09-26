import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';
import {
  DECISION_RECEIPT_SCHEMA,
  FIXTURE_CLASSES,
  readDecisionReceipt,
  selectReviewTopology,
  validateDecisionReceipt,
  validateRiskAdaptiveReviewPolicy,
} from './risk-adaptive-review.mjs';

const canonical = readInvariantRegistry();
const fixtureDir = fileURLToPath(
  new URL('./fixtures/risk-adaptive-review/', import.meta.url)
);

function contract() {
  return canonical.invariants.find(item => item.id === 'JOV-INV-036').policy
    .value;
}

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8'));
}

function healthyReceipt() {
  return loadFixture('certification-inbox-preflight.json');
}

describe('JOV-INV-036 risk-adaptive execution policy', () => {
  it('accepts the canonical risk-adaptive review policy', () => {
    assert.deepEqual(validateRiskAdaptiveReviewPolicy(canonical), []);
  });

  it('covers every required fixture work class', () => {
    for (const name of readdirSync(fixtureDir)) {
      if (name === 'certification-inbox-preflight.json') continue;
      const fixture = loadFixture(name);
      assert.ok(
        FIXTURE_CLASSES.includes(fixture.workItem),
        `unknown fixture class: ${fixture.workItem}`
      );
    }
    const covered = readdirSync(fixtureDir)
      .filter(name => name !== 'certification-inbox-preflight.json')
      .map(name => loadFixture(name).workItem);
    assert.deepEqual([...covered].sort(), [...FIXTURE_CLASSES].sort());
  });

  it('selects the expected topology for every fixture', () => {
    for (const name of readdirSync(fixtureDir)) {
      if (name === 'certification-inbox-preflight.json') continue;
      const fixture = loadFixture(name);
      assert.equal(
        selectReviewTopology(fixture.inputs, contract()),
        fixture.expectedTopology,
        `${name} should select ${fixture.expectedTopology}`
      );
    }
  });

  it('selects strong independent preflight for the certification inbox', () => {
    const fixture = loadFixture('canonical-certification-inbox.json');
    assert.equal(
      selectReviewTopology(fixture.inputs, contract()),
      'independent-preflight'
    );
  });

  it('lets a routine low-risk fix proceed without ceremony', () => {
    const fixture = loadFixture('trivial-copy-fix.json');
    assert.equal(
      selectReviewTopology(fixture.inputs, contract()),
      'postflight'
    );
  });

  it('accepts the durable certification-inbox preflight receipt', () => {
    const receipt = healthyReceipt();
    assert.equal(receipt.schema, DECISION_RECEIPT_SCHEMA);
    assert.deepEqual(validateDecisionReceipt(receipt, contract()), []);
  });

  it('deliberate red: rejects a certification-inbox receipt that skips preflight', () => {
    const receipt = healthyReceipt();
    receipt.chosenTopology = 'postflight';
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(
      errors.includes(
        'receipt-topology-mismatch: expected independent-preflight'
      )
    );
  });

  it('deliberate red: rejects preflight receipts without alternatives or a seam', () => {
    const receipt = healthyReceipt();
    delete receipt.alternativesConsidered;
    delete receipt.smallestCorrectSeam;
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(errors.includes('receipt-alternatives-missing'));
    assert.ok(errors.includes('receipt-smallestCorrectSeam-missing'));
  });

  it('deliberate red: rejects self-review as independent preflight', () => {
    const receipt = healthyReceipt();
    receipt.independenceConstraint = 'self-review';
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(errors.includes('receipt-independence-required'));
    assert.ok(errors.includes('receipt-self-certification-banned'));
  });

  it('deliberate red: rejects capability requirements that name a model', () => {
    const receipt = healthyReceipt();
    receipt.capabilityRequirements = ['claude-opus-architecture-review'];
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(errors.includes('receipt-model-name-banned'));
  });

  it('deliberate red: unknown material inputs must be declared as uncertainty', () => {
    const receipt = healthyReceipt();
    receipt.riskInputs.dataIntegrityRisk = 'unknown';
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(
      errors.includes('receipt-uncertainty-not-declared:dataIntegrityRisk')
    );
  });

  it('deliberate red: rejects outcome records that skip calibration feedback', () => {
    const receipt = healthyReceipt();
    receipt.outcome = {
      actualReviewCost: 2,
      reworkAvoided: 1,
      defectsCaught: 0,
      falseEscalations: 0,
      delayImposed: 0,
      feedsCalibration: false,
    };
    const errors = validateDecisionReceipt(receipt, contract());
    assert.ok(errors.includes('receipt-outcome-not-calibrated'));
  });

  it('deliberate red: rejects a policy that hard-codes a model into a topology', () => {
    const registry = structuredClone(canonical);
    const policy = registry.invariants.find(item => item.id === 'JOV-INV-036')
      .policy.value;
    policy.topologyRequirements['independent-preflight'].capabilities = [
      'gpt-5-review',
    ];
    assert.ok(
      validateRiskAdaptiveReviewPolicy(registry).includes(
        'risk-adaptive-model-name-banned:independent-preflight'
      )
    );
  });

  it('deliberate red: rejects a policy missing a fixture class', () => {
    const registry = structuredClone(canonical);
    const policy = registry.invariants.find(item => item.id === 'JOV-INV-036')
      .policy.value;
    policy.fixtureClasses = policy.fixtureClasses.filter(
      item => item !== 'revenue-emergency'
    );
    assert.ok(
      validateRiskAdaptiveReviewPolicy(registry).includes(
        'risk-adaptive-fixture-classes-incomplete'
      )
    );
  });

  it('reads the durable receipt from its recorded path', () => {
    const receipt = readDecisionReceipt(contract().certificationInbox.receipt);
    assert.equal(receipt.workItem, 'unified-ovi-certification-inbox');
    assert.deepEqual(validateDecisionReceipt(receipt, contract()), []);
  });
});

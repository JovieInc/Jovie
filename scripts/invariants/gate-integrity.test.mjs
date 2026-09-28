import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHealthyGateIntegrityInputs,
  evaluateGateIntegrity,
  gateIntegrityPolicyDigest,
  validateGateIntegrityPolicy,
} from './gate-integrity.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();

function clone() {
  return structuredClone(canonical);
}

function policy(registry) {
  return registry.invariants.find(item => item.id === 'JOV-INV-034').policy
    .value;
}

function resign(registry) {
  policy(registry).policyDigest = gateIntegrityPolicyDigest(policy(registry));
}

describe('JOV-INV-034 gate integrity', () => {
  it('accepts healthy controls and emits revision-bound machine receipts', () => {
    assert.deepEqual(validateGateIntegrityPolicy(canonical), []);
    const inputs = buildHealthyGateIntegrityInputs(canonical);
    assert.equal(inputs.length, 7);
    for (const input of inputs) {
      const receipt = evaluateGateIntegrity(canonical, input);
      assert.equal(receipt.contract, 'jovie.certification/v1');
      assert.equal(receipt.result, 'passed');
      assert.equal(receipt.sourceSha, input.sourceSha);
      assert.equal(receipt.artifact, input.artifact);
      assert.equal(receipt.configDigest, input.configDigest);
      assert.equal(receipt.timestamp, input.timestamp);
      assert.ok(receipt.defectFixture);
      assert.ok(receipt.detector);
      assert.equal(receipt.gate, 'ci-fast');
    }
  });

  it('deliberate red: every representative defect is rejected by its real consumer', () => {
    for (const healthy of buildHealthyGateIntegrityInputs(canonical)) {
      const receipt = evaluateGateIntegrity(canonical, {
        ...healthy,
        detectorOutcome: 'failed',
      });
      assert.equal(receipt.result, 'rejected');
      assert.equal(receipt.reason, 'detector-did-not-pass');
      assert.equal(receipt.gate, 'ci-fast');
    }
  });

  it('deliberate red: missing skipped neutral quarantined and non-applicable evidence never passes', () => {
    const healthy = buildHealthyGateIntegrityInputs(canonical)[0];
    for (const evidenceState of [
      'missing',
      'skipped',
      'neutral',
      'quarantined',
      'not_applicable',
    ]) {
      assert.equal(
        evaluateGateIntegrity(canonical, { ...healthy, evidenceState }).result,
        'rejected'
      );
    }
    assert.equal(
      evaluateGateIntegrity(canonical, { ...healthy, applicable: null }).reason,
      'applicability-not-proven'
    );
  });

  it('deliberate red: swallowed stale wrong-build and forged evidence cannot promote', () => {
    const healthy = buildHealthyGateIntegrityInputs(canonical)[0];
    const mutations = [
      { failureSwallowed: true },
      { evidenceSourceSha: 'b'.repeat(40) },
      { evidenceArtifact: 'artifact:other' },
      { evidenceConfigDigest: 'sha256:other' },
      { detectorReceiptDigest: 'sha256:forged' },
      { evaluatedAt: '2026-09-27T00:00:00.000Z' },
    ];
    for (const mutation of mutations) {
      assert.equal(
        evaluateGateIntegrity(canonical, { ...healthy, ...mutation }).result,
        'rejected'
      );
    }
  });

  it('deliberate red: certifier tampering cannot manufacture certification', () => {
    const mutations = [
      registry => {
        policy(registry).requiredCheck = 'advisory-green';
      },
      registry => {
        policy(registry).certificates[0].detector = 'model narration';
        policy(registry).certificates[0].implemented = false;
      },
      registry => {
        policy(registry).certificates.shift();
      },
      registry => {
        policy(registry).unknownApplicability = 'pass';
      },
    ];
    for (const mutate of mutations) {
      const registry = clone();
      mutate(registry);
      resign(registry);
      assert.notDeepEqual(validateGateIntegrityPolicy(registry), []);
      const [healthy] = buildHealthyGateIntegrityInputs(canonical);
      assert.equal(evaluateGateIntegrity(registry, healthy).result, 'rejected');
    }
  });

  it('deliberate red: changing the rubric or baseline invalidates its signed policy', () => {
    const registry = clone();
    policy(registry).certificates[0].configDigest = 'sha256:changed-baseline';
    assert.ok(
      validateGateIntegrityPolicy(registry).includes('policy-digest:mismatch')
    );
  });
});

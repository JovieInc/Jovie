import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  QUALITY_CONTRACT_SCHEMA,
  QUALITY_RATCHET_INVARIANT_ID,
  readQualityContractRegistry,
  validateQualityContracts,
  validateQualityRatchet,
  validateQualityRatchetPolicy,
} from './quality-ratchet.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();
const contractsRegistry = readQualityContractRegistry();
const NOW = '2026-09-03';

function cloneRegistry() {
  return structuredClone(canonical);
}

function cloneContracts() {
  return structuredClone(contractsRegistry);
}

function ratchetInvariant(registry) {
  const invariant = registry.invariants.find(
    item => item.id === QUALITY_RATCHET_INVARIANT_ID
  );
  assert.ok(invariant, `missing ${QUALITY_RATCHET_INVARIANT_ID}`);
  return invariant;
}

function validException(expiry) {
  return {
    owner: 'Summer',
    rationale: 'dependency-bound journey under calibration',
    scope: 'conversation.first-useful-output only',
    compensatingControls: ['progress-and-state-exposed-immediately'],
    expiry,
  };
}

describe('JOV-INV-027 quality ratchet policy', () => {
  it('accepts the canonical invariant registry with the quality ratchet policy', () => {
    assert.deepEqual(validateQualityRatchetPolicy(canonical), []);
  });

  it('accepts the checked-in quality contract registry', () => {
    assert.deepEqual(validateQualityRatchet(canonical, { now: NOW }), []);
    assert.deepEqual(
      validateQualityContracts(contractsRegistry, canonical, { now: NOW }),
      []
    );
    assert.ok(contractsRegistry.contracts.length >= 6);
  });

  it('deliberate red: rejects a contract missing a required quality dimension', () => {
    const candidate = cloneContracts();
    delete candidate.contracts[0].dimensions.accessibility;
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      /missing required quality dimension accessibility/
    );
  });

  it('deliberate red: rejects a floor looser than the company default without an expiring exception', () => {
    const candidate = cloneContracts();
    const contract = candidate.contracts.find(
      item => item.id === 'conversation.first-useful-output'
    );
    assert.ok(contract, 'missing seed contract');
    contract.dimensions.responsiveness.hardFloorMs = 5000;
    const errors = validateQualityContracts(candidate, canonical, {
      now: NOW,
    }).join('\n');
    assert.match(errors, /looser than the company default 2000ms/);
    contract.exception = validException('2026-08-01');
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      /exception expired on 2026-08-01/
    );
  });

  it('permits a looser floor only with a complete unexpired exception', () => {
    const candidate = cloneContracts();
    const contract = candidate.contracts.find(
      item => item.id === 'conversation.first-useful-output'
    );
    assert.ok(contract, 'missing seed contract');
    contract.dimensions.responsiveness.hardFloorMs = 5000;
    contract.exception = validException('2026-12-31');
    assert.deepEqual(
      validateQualityContracts(candidate, canonical, { now: NOW }),
      []
    );
  });

  it('deliberate red: rejects an unmeasured value with a non-zero sample size', () => {
    const candidate = cloneContracts();
    candidate.contracts[0].dimensions.responsiveness.observed.sampleSize = 10;
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      /unmeasured value requires sampleSize 0/
    );
  });

  it('deliberate red: rejects drift in the company responsiveness defaults', () => {
    const candidate = cloneRegistry();
    ratchetInvariant(
      candidate
    ).policy.value.responsivenessDefaults.conversationMessageEcho.floorMs = 500;
    assert.match(
      validateQualityRatchetPolicy(candidate).join('\n'),
      /responsiveness defaults drifted/
    );
  });

  it('deliberate red: rejects an unowned company responsiveness default', () => {
    const candidate = cloneContracts();
    for (const contract of candidate.contracts) {
      if (
        contract.dimensions.responsiveness.defaultKey ===
        'conversationMessageEcho'
      ) {
        delete contract.dimensions.responsiveness.defaultKey;
      }
    }
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      /no registered contract owns the conversationMessageEcho default/
    );
  });

  it('deliberate red: rejects a contract bound to an unknown default', () => {
    const candidate = cloneContracts();
    candidate.contracts[0].dimensions.responsiveness.defaultKey = 'madeUp';
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      /unknown responsiveness default madeUp/
    );
  });

  it('rejects a registry whose contracts omit the ratchet schema', () => {
    const candidate = cloneContracts();
    candidate.contracts[0].schema = 'jovie-quality-contract/v0';
    assert.match(
      validateQualityContracts(candidate, canonical, { now: NOW }).join('\n'),
      new RegExp(`schema must be ${QUALITY_CONTRACT_SCHEMA}`)
    );
  });
});

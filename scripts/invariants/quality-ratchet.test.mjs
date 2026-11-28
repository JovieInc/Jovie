import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateQualityOperationEvidence,
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
    // Set the value explicitly: the checked-in seed may already be measured
    // (canon observed values are populated from production telemetry), so the
    // deliberate red must not lean on the seed's unmeasured state.
    candidate.contracts[0].dimensions.responsiveness.observed.value = null;
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

const SOURCE_REVISION = '1'.repeat(40);
const OPERATION_REQUIREMENTS = {
  'local-transient': ['local-feedback'],
  'durable-write': [
    'canonical-authority',
    'committed-receipt',
    'replay-and-conflict',
    'revision-concurrency',
    'authoritative-recovery',
  ],
  'external-effect': [
    'persisted-effect-intent',
    'dispatch-authority',
    'provider-settlement',
  ],
  continuation: [
    'durable-attempt',
    'bounded-recovery',
    'missed-event-recovery',
    'useful-attention',
  ],
  'human-handoff': [
    'human-required-boundary',
    'resume-recovery',
    'useful-attention',
  ],
};

function operationRegistry(classes) {
  const requirements = new Set(classes.flatMap(c => OPERATION_REQUIREMENTS[c]));
  const registry = cloneContracts();
  registry.contracts[0].operationEvidence = [
    {
      operationId: 'fixture.operation',
      surface: 'web',
      classes,
      sourceRevision: SOURCE_REVISION,
      evidence: Object.fromEntries(
        [...requirements].map(requirement => [
          requirement,
          [`proof:${requirement}`],
        ])
      ),
    },
  ];
  return registry;
}

// Synthetic trusted-owner responses exercise the evaluator, never product proof.
function resolveProof(kind = 'runtime', overrides = {}) {
  return (reference, expected) => ({
    ...expected,
    reference,
    kind,
    outcome: 'passed',
    ...(kind === 'runtime'
      ? { environment: 'fixture', deploymentId: 'fixture-deployment' }
      : {}),
    ...overrides,
  });
}

function assess(registry, resolveEvidence = resolveProof()) {
  return evaluateQualityOperationEvidence(registry, canonical, {
    resolveEvidence,
  });
}

describe('operation evidence qualification stays scoped and in shadow', () => {
  it('preserves responsiveness-only contracts without implying inventory completeness', () => {
    const report = assess(contractsRegistry);
    assert.equal(report.mode, 'shadow');
    assert.equal(report.inventoryComplete, false);
    assert.equal(report.certifiesProduct, false);
    assert.equal(report.operations.length, 0);
    assert.equal(
      report.unassessedContracts.length,
      contractsRegistry.contracts.length
    );
    assert.deepEqual(
      validateQualityContracts(contractsRegistry, canonical, { now: NOW }),
      []
    );
  });

  it('neighboring green: local feedback requires no durable or provider machinery', () => {
    const report = assess(operationRegistry(['local-transient']));
    assert.deepEqual(report.operations[0].requirements, ['local-feedback']);
    assert.equal(report.operations[0].evidenceLevel, 'runtime-verified');
    assert.equal(report.certifiesProduct, false);
  });

  it('distinguishes source proof from independently verified runtime evidence', () => {
    const registry = operationRegistry(['durable-write']);
    assert.equal(
      assess(registry, resolveProof('source')).operations[0].evidenceLevel,
      'source-proven'
    );
    assert.equal(
      assess(registry).operations[0].evidenceLevel,
      'runtime-verified'
    );
  });

  for (const context of [
    { environment: 'fixture', deploymentId: 'another-deployment' },
    { environment: 'staging', deploymentId: 'fixture-deployment' },
    { environment: 'staging', deploymentId: 'another-deployment' },
  ]) {
    it(`deliberate red: cannot combine runtime proof from ${context.environment}/${context.deploymentId}`, () => {
      const report = assess(
        operationRegistry(['durable-write']),
        (reference, expected) =>
          resolveProof(
            'runtime',
            expected.requirement === 'committed-receipt' ? context : {}
          )(reference, expected)
      );
      assert.equal(report.operations[0].evidenceLevel, 'source-proven');
      assert.equal(report.operations[0].runtimeContext, null);
      assert.match(
        report.findings.join('\n'),
        /one environment and deployment/
      );
    });
  }

  it('neighboring green: one complete runtime context qualifies despite incomplete other contexts', () => {
    const registry = operationRegistry(['durable-write', 'external-effect']);
    for (const [requirement, references] of Object.entries(
      registry.contracts[0].operationEvidence[0].evidence
    )) {
      references.unshift(`other:${requirement}`);
    }
    const report = assess(registry, (reference, expected) =>
      resolveProof(
        'runtime',
        reference.startsWith('other:')
          ? {
              environment: 'staging',
              deploymentId:
                expected.requirement === 'committed-receipt' ? 'A' : 'B',
            }
          : {}
      )(reference, expected)
    );
    assert.equal(report.operations[0].evidenceLevel, 'runtime-verified');
    assert.deepEqual(report.operations[0].runtimeContext, {
      environment: 'fixture',
      deploymentId: 'fixture-deployment',
    });
    assert.deepEqual(report.findings, []);
  });

  for (const { classes, missing } of [
    { classes: ['durable-write'], missing: 'committed-receipt' },
    { classes: ['durable-write'], missing: 'authoritative-recovery' },
    {
      classes: ['durable-write', 'external-effect'],
      missing: 'provider-settlement',
    },
    { classes: ['continuation'], missing: 'missed-event-recovery' },
    { classes: ['human-handoff'], missing: 'human-required-boundary' },
  ]) {
    it(`deliberate red: missing ${missing} cannot verify applicable work`, () => {
      const registry = operationRegistry(classes);
      delete registry.contracts[0].operationEvidence[0].evidence[missing];
      const report = assess(registry);
      assert.equal(report.operations[0].evidenceLevel, 'unknown');
      assert.ok(report.operations[0].missing.includes(missing));
    });
  }

  it('composes continuation and human handoff without waiving either boundary', () => {
    const report = assess(operationRegistry(['continuation', 'human-handoff']));
    assert.ok(
      report.operations[0].requirements.includes('missed-event-recovery')
    );
    assert.ok(
      report.operations[0].requirements.includes('human-required-boundary')
    );
    assert.equal(report.operations[0].evidenceLevel, 'runtime-verified');
  });

  it('declared references and runtimeVerified assertions alone remain unknown', () => {
    const registry = operationRegistry(['durable-write']);
    registry.contracts[0].operationEvidence[0].runtimeVerified = true;
    const report = evaluateQualityOperationEvidence(registry, canonical);
    assert.equal(report.operations[0].evidenceLevel, 'unknown');
  });

  for (const overrides of [
    { sourceRevision: '2'.repeat(40) },
    { contractId: 'another-contract' },
    { contractVersion: 99 },
    { operationId: 'another.operation' },
    { surface: 'cli' },
    { requirement: 'another-requirement' },
    { reference: 'another-proof' },
    { outcome: 'failed' },
    { environment: '' },
    { deploymentId: '' },
  ]) {
    it(`deliberate red: rejects mismatched or incomplete proof ${Object.keys(overrides)[0]}`, () => {
      const report = assess(
        operationRegistry(['local-transient']),
        resolveProof('runtime', overrides)
      );
      assert.equal(report.operations[0].evidenceLevel, 'unknown');
    });
  }

  it('external effects cannot omit durable write guarantees', () => {
    const report = assess(operationRegistry(['external-effect']));
    assert.equal(report.operations[0].evidenceLevel, 'unknown');
    assert.match(report.findings.join('\n'), /also requires durable-write/);
  });

  it('runtime reporting retains the exact source and deployment evidence', () => {
    const report = assess(operationRegistry(['local-transient']));
    const operation = report.operations[0];
    assert.equal(operation.sourceRevision, SOURCE_REVISION);
    assert.equal(operation.evidence[0].deploymentId, 'fixture-deployment');
    assert.equal(operation.evidence[0].environment, 'fixture');
    assert.equal(operation.evidence[0].reference, 'proof:local-feedback');
  });

  it('falls back to valid source proof when runtime evidence cannot be verified', () => {
    const registry = operationRegistry(['local-transient']);
    registry.contracts[0].operationEvidence[0].evidence['local-feedback'].push(
      'proof:source'
    );
    const report = assess(registry, (ref, expected) =>
      ref === 'proof:source' ? resolveProof('source')(ref, expected) : null
    );
    assert.equal(report.operations[0].evidenceLevel, 'source-proven');
  });

  it('isolates unavailable evidence readers and does not claim success', () => {
    const report = assess(operationRegistry(['local-transient']), () => {
      throw new Error('reader unavailable');
    });
    assert.equal(report.operations[0].evidenceLevel, 'unknown');
    assert.match(report.findings.join('\n'), /evidence reader unavailable/);
  });

  it('reports malformed, duplicate and unknown operations without losing the denominator', () => {
    const registry = operationRegistry(['local-transient']);
    registry.contracts[0].operationEvidence.push(
      structuredClone(registry.contracts[0].operationEvidence[0]),
      { operationId: 'bad.operation', classes: ['invented'] }
    );
    registry.contracts[1].operationEvidence = 'invalid';
    const report = assess(registry);
    assert.equal(report.operations.length, 3);
    assert.equal(report.operations[1].evidenceLevel, 'unknown');
    assert.equal(report.operations[2].evidenceLevel, 'unknown');
    assert.ok(report.unassessedContracts.includes(registry.contracts[1].id));
    assert.match(
      report.findings.join('\n'),
      /duplicate operation|unknown operation class/
    );
  });

  it('shadow findings do not block legacy contracts or weaken their required checks', () => {
    const registry = operationRegistry(['durable-write']);
    registry.contracts[0].operationEvidence[0].evidence = {};
    assert.equal(assess(registry).operations[0].evidenceLevel, 'unknown');
    assert.deepEqual(
      validateQualityContracts(registry, canonical, { now: NOW }),
      []
    );
    delete registry.contracts[0].dimensions.correctness;
    registry.contracts[0].dimensions.responsiveness.hardFloorMs = 51;
    const errors = validateQualityContracts(registry, canonical, { now: NOW });
    assert.match(
      errors.join('\n'),
      /missing required quality dimension correctness/
    );
    assert.match(errors.join('\n'), /looser than the company default 50ms/);
  });
});

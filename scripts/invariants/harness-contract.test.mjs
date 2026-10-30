import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHarnessReceipt,
  HARNESS_CONTRACT_INVARIANT_ID,
  HARNESS_RECEIPT_SCHEMA,
  validateHarnessContract,
} from './harness-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();
const NOW = '2026-09-03';

function clone() {
  return structuredClone(canonical);
}

function harnessInvariant(registry) {
  const invariant = registry.invariants.find(
    item => item.id === HARNESS_CONTRACT_INVARIANT_ID
  );
  assert.ok(invariant, `missing ${HARNESS_CONTRACT_INVARIANT_ID}`);
  return invariant;
}

function harnessPrinciple(registry, id) {
  const principle = harnessInvariant(registry).policy.value.principles.find(
    item => item.id === id
  );
  assert.ok(principle, `missing principle ${id}`);
  return principle;
}

// Injected file system that satisfies every gate/fixture binding except the
// one a deliberate-red case deliberately breaks.
const FIXTURE_TEXT = harnessInvariant(canonical)
  .policy.value.principles.map(principle => principle.deliberateRed.name)
  .join('\n');

function passFs(overrides = {}) {
  return {
    fileExists: () => true,
    readFile: () => FIXTURE_TEXT,
    now: NOW,
    ...overrides,
  };
}

describe('JOV-INV-024 harness contract', () => {
  it('accepts the checked-in harness contract', () => {
    assert.deepEqual(validateHarnessContract(canonical, { now: NOW }), []);
  });

  it('emits a deterministic zero-overhead receipt', () => {
    const first = buildHarnessReceipt(canonical, { now: NOW });
    const second = buildHarnessReceipt(canonical, { now: NOW });
    assert.deepEqual(first, second);
    assert.equal(first.schema, HARNESS_RECEIPT_SCHEMA);
    assert.equal(first.invariant, HARNESS_CONTRACT_INVARIANT_ID);
    assert.equal(first.principles, 9);
    assert.equal(first.enforced, 3);
    assert.equal(first.partial, 6);
    assert.deepEqual(first.overhead, {
      addedProcesses: 0,
      addedCiJobs: 0,
      apiCalls: 0,
      llmCalls: 0,
      dollarCost: 0,
    });
    for (const exception of first.exceptions) {
      assert.match(exception.exception, /^H-EX-0[1-9]$/);
      assert.equal(exception.owner, 'Summer');
      assert.match(exception.expires, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(exception.nextAction.length > 0);
    }
  });

  it('deliberate red H-01: a dropped bounded-repo-map principle fails closed', () => {
    const registry = clone();
    const policy = harnessInvariant(registry).policy.value;
    policy.principles = policy.principles.filter(item => item.id !== 'H-01');
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-principle-missing: H-01'))
    );
    assert.ok(errors.some(error => error.includes('harness-principles-count')));
  });

  it('deliberate red H-02: a principle without an event trigger fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-02').trigger.event = '';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error =>
        error.includes('harness-principle-incomplete:H-02:trigger.event')
      )
    );
  });

  it('deliberate red H-03: non-Summer policy ownership fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-03').policyOwner = 'Symphony';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-policy-owner:H-03'))
    );
  });

  it('deliberate red H-04: a gate path that does not exist fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-04').gate.path = 'scripts/does-not-exist.mjs';
    const errors = validateHarnessContract(
      registry,
      passFs({ fileExists: path => path !== 'scripts/does-not-exist.mjs' })
    );
    assert.ok(
      errors.some(error => error.includes('harness-gate-missing:H-04'))
    );
  });

  it('deliberate red H-05: an unbound deliberate-red fixture fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-05').deliberateRed.name =
      'deliberate red H-05: a renamed fixture test fails closed';
    const errors = validateHarnessContract(
      registry,
      passFs({ readFile: () => 'unrelated fixture content' })
    );
    assert.ok(
      errors.some(error => error.includes('harness-deliberate-red:H-05'))
    );
  });

  it('deliberate red H-06: a receipt without the deterministic command fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-06').receipt = 'pnpm invariants:check';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(errors.some(error => error.includes('harness-receipt:H-06')));
  });

  it('deliberate red H-07: an unknown principle status fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-07').status = 'aspirational';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(errors.some(error => error.includes('harness-status:H-07')));
  });

  it('deliberate red H-08: a partial principle without an exception fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-08').exception = null;
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-missing:H-08'))
    );
  });

  it('deliberate red H-09: an enforced principle carrying an exception fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-09').status = 'enforced';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-unexpected:H-09'))
    );
  });

  it('deliberate red: an expired exception fails closed and a live one passes', () => {
    const expired = clone();
    harnessPrinciple(expired, 'H-02').exception.expires = '2026-08-01';
    const errors = validateHarnessContract(expired, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-expired:H-02'))
    );

    const live = clone();
    harnessPrinciple(live, 'H-02').exception.expires = '2026-09-30';
    assert.deepEqual(validateHarnessContract(live, passFs()), []);

    const wrongOwner = clone();
    harnessPrinciple(wrongOwner, 'H-02').exception.owner = 'Gem';
    assert.ok(
      validateHarnessContract(wrongOwner, passFs()).some(error =>
        error.includes('harness-exception-owner:H-02')
      )
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

const canonical = readInvariantRegistry();

function clone() {
  return structuredClone(canonical);
}

describe('canonical invariant registry', () => {
  it('accepts the canonical checked-in registry', () => {
    assert.deepEqual(validateInvariantRegistry(canonical), {
      ok: true,
      errors: [],
      blockers: [],
    });
  });

  it('rejects a second executable registry declaration', () => {
    const candidate = clone();
    candidate.invariants[0].policy.value = 'docs/another-registry.jsonl';
    candidate.invariants.push({
      ...structuredClone(candidate.invariants[0]),
      id: 'JOV-INV-999',
      policy: {
        key: 'invariants.registry.path',
        value: 'canon/invariants.jsonl',
      },
    });
    assert.match(
      validateInvariantRegistry(candidate).errors.join('\n'),
      /contradictory invariants\.registry\.path/
    );
  });

  it('rejects an invariant with incomplete required fields', () => {
    const candidate = clone();
    delete candidate.invariants[0].scope;
    assert.match(
      validateInvariantRegistry(candidate).errors.join('\n'),
      /missing scope/
    );
  });

  it('rejects contradictory overlapping active invariants', () => {
    const candidate = clone();
    candidate.invariants.push({
      ...structuredClone(candidate.invariants[7]),
      id: 'JOV-INV-998',
      effective: { date: '2026-08-23', version: 2 },
      policy: {
        key: 'fleet.authority.states',
        value: { AMBER: ['merge'], GREEN: ['merge'], RED: [] },
      },
    });
    const errors = validateInvariantRegistry(candidate).errors.join('\n');
    assert.match(errors, /contradictory fleet\.authority\.states/);
    assert.match(errors, /newest founder-approved candidate is JOV-INV-998/);
  });

  it('accepts explicit reciprocal supersession', () => {
    const candidate = clone();
    const older = candidate.invariants[7];
    older.lifecycle = {
      state: 'superseded',
      supersedes: [],
      supersededBy: 'JOV-INV-998',
    };
    candidate.invariants.push({
      ...structuredClone(older),
      id: 'JOV-INV-998',
      effective: { date: '2026-08-23', version: 2 },
      policy: {
        key: 'fleet.authority.states',
        value: { AMBER: ['tests'], GREEN: ['merge'], RED: [] },
      },
      lifecycle: {
        state: 'adopted',
        supersedes: ['JOV-INV-008'],
        supersededBy: null,
      },
    });
    assert.equal(
      validateInvariantRegistry(candidate, { verifyBindings: false }).ok,
      true
    );
  });

  it('rejects an adopted orphan without a bound consumer', () => {
    const candidate = clone();
    candidate.invariants[3].enforcementConsumers = [];
    assert.match(
      validateInvariantRegistry(candidate).errors.join('\n'),
      /adopted invariant has no production consumer/
    );
  });
});

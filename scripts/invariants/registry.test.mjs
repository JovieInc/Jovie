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

function getInvariant(registry, id) {
  const invariant = registry.invariants.find(item => item.id === id);
  assert.ok(invariant, `missing ${id}`);
  return invariant;
}

describe('canonical invariant registry', () => {
  it('accepts the canonical checked-in registry', () => {
    assert.deepEqual(validateInvariantRegistry(canonical), {
      ok: true,
      errors: [],
      blockers: [],
    });
  });

  it('resolves the canonical registry independently of process cwd', () => {
    const originalCwd = process.cwd();
    process.chdir('scripts/backlog-orchestrator');
    try {
      const fromControllerCwd = readInvariantRegistry();
      assert.equal(fromControllerCwd.schema, canonical.schema);
      assert.deepEqual(validateInvariantRegistry(fromControllerCwd), {
        ok: true,
        errors: [],
        blockers: [],
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('rejects a second executable registry declaration', () => {
    const candidate = clone();
    const registryAuthority = getInvariant(candidate, 'JOV-INV-001');
    registryAuthority.policy.value = 'docs/another-registry.jsonl';
    candidate.invariants.push({
      ...structuredClone(registryAuthority),
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
    const fleetAuthority = getInvariant(candidate, 'JOV-INV-008');
    candidate.invariants.push({
      ...structuredClone(fleetAuthority),
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
    const older = getInvariant(candidate, 'JOV-INV-008');
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
    getInvariant(candidate, 'JOV-INV-004').enforcementConsumers = [];
    assert.match(
      validateInvariantRegistry(candidate).errors.join('\n'),
      /adopted invariant has no production consumer/
    );
  });

  it('rejects a contradictory design invariant projection', () => {
    const candidate = clone();
    const designAuthority = getInvariant(candidate, 'JOV-INV-019');
    candidate.invariants.push({
      ...structuredClone(designAuthority),
      id: 'JOV-INV-997',
      effective: { date: '2026-08-29', version: 2 },
      policy: {
        key: 'design.agent-contract.invariants',
        value: {
          ...structuredClone(designAuthority.policy.value),
          invariants: designAuthority.policy.value.invariants.slice(1),
        },
      },
    });
    assert.match(
      validateInvariantRegistry(candidate, {
        verifyBindings: false,
      }).errors.join('\n'),
      /contradictory design\.agent-contract\.invariants/
    );
  });
});

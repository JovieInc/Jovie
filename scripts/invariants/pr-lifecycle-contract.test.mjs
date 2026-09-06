import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  policyDigest,
  validatePrLifecycleContract,
} from './pr-lifecycle-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

const registry = readInvariantRegistry();

describe('JOV-INV-029 PR lifecycle contract', () => {
  it('accepts the checked-in contract and produces a stable digest', () => {
    assert.deepEqual(validatePrLifecycleContract(registry), []);
    assert.match(
      policyDigest(
        registry.invariants.find(item => item.id === 'JOV-INV-029').policy.value
      ),
      /^[0-9a-f]{64}$/
    );
  });

  it('fails closed when an exit rule conflicts', () => {
    const candidate = structuredClone(registry);
    candidate.invariants.find(
      item => item.id === 'JOV-INV-029'
    ).policy.value.phases[4].exit = 'merged';
    assert.match(
      validatePrLifecycleContract(candidate).join('\n'),
      /pr-lifecycle-exit:activation/
    );
  });

  it('fails closed when a source binding disappears', () => {
    assert.match(
      validatePrLifecycleContract(registry, { readFile: () => '' }).join('\n'),
      /pr-lifecycle-binding:/
    );
  });
});

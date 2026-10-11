import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  policyDigest,
  READY_FOR_REVIEW_SUBSCRIBER,
  readPrLifecycleContract,
  validatePrLifecycleContract,
} from './pr-lifecycle-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

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

  it('reads the lifecycle contract from the multi-row invariant registry', () => {
    assert.equal(readPrLifecycleContract()?.schema, 'jovie-pr-lifecycle/v1');
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

  it('fails closed when ready_for_review is allowed to restart CI', () => {
    const candidate = structuredClone(registry);
    candidate.invariants.find(
      item => item.id === 'JOV-INV-029'
    ).policy.value.readyForReview.restartsCi = true;
    assert.match(
      validatePrLifecycleContract(candidate).join('\n'),
      /pr-lifecycle-ready-for-review-restarts-ci/
    );
  });

  it('fails closed when another workflow subscribes to ready_for_review', () => {
    assert.match(
      validatePrLifecycleContract(registry, {
        readFile: path => {
          const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');
          if (path === '.github/workflows/ci.yml')
            return `${source}\ntypes: [ready_for_review]\n`;
          return source;
        },
      }).join('\n'),
      /pr-lifecycle-ready-for-review-extra:ci.yml/
    );
  });

  it('fails closed when auto-merge drops ready_for_review', () => {
    assert.match(
      validatePrLifecycleContract(registry, {
        readFile: path => {
          const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');
          if (path === READY_FOR_REVIEW_SUBSCRIBER)
            return source.replaceAll('ready_for_review', 'opened');
          return source;
        },
      }).join('\n'),
      /pr-lifecycle-ready-for-review-trigger/
    );
  });
});

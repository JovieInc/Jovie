import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPABILITY_SOURCING_INVARIANT_ID,
  CAPABILITY_SOURCING_POLICY_SECTION,
  CAPABILITY_SOURCING_RECEIPT_SCHEMA,
  CAPABILITY_SOURCING_SCHEMA,
  capabilitySourcingPolicyDigest,
  SOURCING_RECEIPT_REQUIRED_FIELDS,
  validateCapabilitySourcingPolicy,
  validateSourcingReceipt,
} from './capability-sourcing.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();

function healthyReceipt(overrides = {}) {
  return {
    schema: CAPABILITY_SOURCING_RECEIPT_SCHEMA,
    outcome: 'Artist one-sheet renders from the approved renderer',
    capability: 'document rendering (artist one-sheet)',
    canonicalOwner: 'apps/web/lib/documents/renderer.ts',
    hardRequirements: null,
    decisionReference: 'gbrain decision page documents/renderer-2026-08',
    alternatives: [
      {
        name: 'existing approved renderer',
        source: 'apps/web/lib/documents/renderer.ts',
        version: 'main@dc2c2219392e8657e5ee7c0d0228b62e1d902c81',
        checkedDate: '2026-09-25',
      },
    ],
    disposition: 'reuse',
    rejectedAlternatives: null,
    customDelta: null,
    lifetimeCostRisk: 'no new dependency; zero incremental ownership',
    tests: 'apps/web/tests/unit/documents/one-sheet.test.ts',
    rollbackTriggers: 'renderer contract regression',
    repository: 'JovieInc/Jovie',
    headSha: 'a'.repeat(40),
    policyBinding: CAPABILITY_SOURCING_POLICY_SECTION,
    touchedPaths: ['apps/web/lib/documents/one-sheet.ts'],
    exceptionRequested: false,
    independentReview: null,
    ...overrides,
  };
}

describe('JOV-INV-041 capability sourcing policy', () => {
  it('accepts the canonical checked-in policy', () => {
    assert.deepEqual(validateCapabilitySourcingPolicy(canonical), []);
  });

  it('policy schema, canonical section, and shadow-first enforcement are pinned', () => {
    const policy = canonical.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value;
    assert.equal(policy.schema, CAPABILITY_SOURCING_SCHEMA);
    assert.equal(policy.canonicalPolicy, CAPABILITY_SOURCING_POLICY_SECTION);
    assert.equal(policy.enforcement, 'shadow-first');
    assert.equal(policy.blocking, false);
    assert.equal(policy.webSearchInGate, false);
    assert.equal(policy.selfAuthorization, 'prohibited');
  });

  it('deliberate red: missing, shadow-flipped, blocking, and digest-drifted policy fail closed', () => {
    const clone = structuredClone(canonical);
    delete clone.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value;
    assert.ok(
      validateCapabilitySourcingPolicy(clone).includes(
        `missing:${CAPABILITY_SOURCING_INVARIANT_ID}`
      )
    );
    const flipped = structuredClone(canonical);
    flipped.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value.blocking = true;
    assert.ok(
      validateCapabilitySourcingPolicy(flipped).includes(
        'blocking:must-be-false-until-shadow-qualified'
      )
    );
    const drifted = structuredClone(canonical);
    drifted.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value.enforcement = 'blocking';
    assert.ok(
      validateCapabilitySourcingPolicy(drifted).includes(
        'enforcement:must-be-shadow-first'
      )
    );
    const forged = structuredClone(canonical);
    forged.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value.dispositions = ['reuse', 'invent'];
    assert.ok(
      validateCapabilitySourcingPolicy(forged).includes(
        'dispositions:unknown-invent'
      )
    );
  });

  it('policy digest recomputation binds the exact policy value', () => {
    const policy = canonical.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    ).policy.value;
    assert.equal(policy.policyDigest, capabilitySourcingPolicyDigest(policy));
    const mutated = structuredClone(policy);
    mutated.selfAuthorization = 'author-discretion';
    assert.notEqual(
      mutated.policyDigest,
      capabilitySourcingPolicyDigest(mutated)
    );
    const resigned = structuredClone(mutated);
    resigned.policyDigest = capabilitySourcingPolicyDigest(resigned);
    assert.equal(
      resigned.policyDigest,
      capabilitySourcingPolicyDigest(resigned)
    );
  });
});

describe('JOV-INV-041 minimal sourcing receipt', () => {
  it('accepts a healthy reuse receipt (positive acceptance test)', () => {
    assert.deepEqual(validateSourcingReceipt(healthyReceipt()), []);
  });

  it('every required field is enforced; none may be dropped', () => {
    for (const field of SOURCING_RECEIPT_REQUIRED_FIELDS) {
      const receipt = healthyReceipt();
      delete receipt[field];
      assert.ok(
        validateSourcingReceipt(receipt).includes(`receipt:missing-${field}`),
        field
      );
    }
  });

  it('deliberate red: custom build without hard requirements or rejected alternatives fails', () => {
    const renamed = healthyReceipt({
      disposition: 'build',
      hardRequirements:
        'no credible candidate supports streaming partial renders under 200ms p95',
      rejectedAlternatives: [
        'existing renderer (no streaming), vendor SDK (license incompatible)',
      ],
    });
    assert.deepEqual(validateSourcingReceipt(renamed), []);
    assert.ok(
      validateSourcingReceipt(
        healthyReceipt({ disposition: 'build', rejectedAlternatives: ['x'] })
      ).includes('receipt:custom-disposition-requires-hard-requirements')
    );
    assert.ok(
      validateSourcingReceipt(
        healthyReceipt({
          disposition: 'build',
          hardRequirements: 'streaming under 200ms',
        })
      ).includes('receipt:custom-disposition-requires-rejected-alternatives')
    );
    assert.ok(
      validateSourcingReceipt(
        healthyReceipt({ disposition: 'hand-roll' })
      ).includes('receipt:unknown-disposition-hand-roll')
    );
  });

  it('deliberate red: alternatives without authoritative evidence, version, or date fail closed', () => {
    const bare = healthyReceipt({
      alternatives: [{ name: 'existing approved renderer' }],
    });
    const errors = validateSourcingReceipt(bare);
    assert.ok(
      errors.includes(
        'receipt:alternative-missing-source:existing approved renderer'
      )
    );
    assert.ok(
      errors.includes(
        'receipt:alternative-missing-version:existing approved renderer'
      )
    );
    assert.ok(
      errors.includes(
        'receipt:alternative-missing-checked-date:existing approved renderer'
      )
    );
  });

  it('deliberate red: an untracked fork contract fails (no upstream, owner, or exit trigger)', () => {
    const missingContract = healthyReceipt({ disposition: 'fork' });
    const errors = validateSourcingReceipt(missingContract);
    assert.ok(errors.includes('receipt:fork-requires-upstream'));
    assert.ok(errors.includes('receipt:fork-requires-patch-scope'));
    assert.ok(errors.includes('receipt:fork-requires-update-owner'));
    assert.ok(errors.includes('receipt:fork-requires-exit-trigger'));
    const trackedFork = healthyReceipt({
      disposition: 'fork',
      hardRequirements:
        'no credible candidate runs offline in the Electron sandbox',
      rejectedAlternatives: ['vendor SDK (requires network)'],
      forkUpstream: 'https://github.com/example/upstream (MIT)',
      forkPatchScope: 'three commits under patches/renderer/',
      forkUpdateOwner: 'Summer',
      forkExitTrigger: 'upstream lands offline mode in v3',
    });
    assert.deepEqual(validateSourcingReceipt(trackedFork), []);
  });

  it('deliberate red: self-authorization over policy or checker paths fails without independent review', () => {
    const selfAuthorized = healthyReceipt({
      touchedPaths: [
        'apps/web/lib/documents/one-sheet.ts',
        'canon/invariants.jsonl',
      ],
    });
    assert.ok(
      validateSourcingReceipt(selfAuthorized).includes(
        'receipt:self-authorization-over-canon/invariants.jsonl-requires-independent-review'
      )
    );
    const reviewed = healthyReceipt({
      touchedPaths: [
        'apps/web/lib/documents/one-sheet.ts',
        'canon/invariants.jsonl',
      ],
      independentReview:
        'reviewer: Fable Developer (independent of the implementation author)',
    });
    assert.deepEqual(validateSourcingReceipt(reviewed), []);
    const exceptionWithoutReview = healthyReceipt({ exceptionRequested: true });
    assert.ok(
      validateSourcingReceipt(exceptionWithoutReview).includes(
        'receipt:exception-requires-independent-review'
      )
    );
  });

  it('deliberate red: stale-head and wrong-repository bindings fail closed', () => {
    assert.ok(
      validateSourcingReceipt(healthyReceipt({ headSha: 'short' })).includes(
        'receipt:invalid-or-missing-head-sha'
      )
    );
    assert.ok(
      validateSourcingReceipt(healthyReceipt({ repository: '' })).includes(
        'receipt:missing-repository'
      )
    );
    assert.ok(
      validateSourcingReceipt(
        healthyReceipt({
          policyBinding: 'remembered notes from a previous chat',
        })
      ).includes('receipt:policy-binding-does-not-name-the-sourcing-policy')
    );
  });
});

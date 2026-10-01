import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CAPABILITY_SOURCING_CHECK_CLASS,
  CAPABILITY_SOURCING_INVARIANT_ID,
  CAPABILITY_SOURCING_SCHEMA,
  CAPABILITY_SOURCING_SLUG,
  loadSourcingReceipts,
  validateCapabilitySourcing,
  validateCapabilitySourcingContract,
  validateSourcingReceipt,
} from './capability-sourcing-receipt.mjs';
import { readInvariantRegistry } from './registry.mjs';

const CANONICAL = readInvariantRegistry();

function healthyReceipt() {
  return {
    id: 'jovie-sourcing-receipt-001',
    outcome: 'Desktop auth link opens in the default browser',
    capability: 'OS default-browser open (desktop auth handoff)',
    classification: 'necessary integration',
    canonicalOwner: 'shell module in apps/desktop/src',
    hardRequirement:
      'No credible candidate survives the 2026-09-12 audit; Electron shell open is the documented canonical path',
    alternatives: [
      {
        name: 'Better Auth Electron integration',
        source: 'https://better-auth.com/docs/integrations/electron',
        version: 'docs revision September 2026',
        checkedDate: '2026-09-12',
      },
    ],
    disposition: 'build',
    versions: [{ name: 'electron', version: '34.2.0' }],
    binding: {
      repository: 'JovieInc/Jovie',
      policyVersion: 'JOV-6212 policy 2026-09-12',
      checkedDate: '2026-09-12',
    },
    author: 'desktop-auth implementer',
    exception: false,
  };
}

describe('JOV-INV-035 capability-sourcing-receipt-v1', () => {
  it('binds JOV-INV-035 in the adopted registry as shadow-advisory', () => {
    const invariant = CANONICAL.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    );
    assert.ok(invariant, 'JOV-INV-035 must be in canon/invariants.jsonl');
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.equal(invariant.policy.value.schema, CAPABILITY_SOURCING_SCHEMA);
    assert.equal(
      invariant.policy.value.checkClass,
      CAPABILITY_SOURCING_CHECK_CLASS
    );
    assert.equal(invariant.policy.value.gbrainSlug, CAPABILITY_SOURCING_SLUG);
    assert.equal(invariant.policy.value.enforcement, 'shadow-advisory');
    assert.equal(invariant.policy.value.inventFacts, false);
  });

  it('accepts the checked-in policy contract and receipt ledger', () => {
    assert.deepEqual(validateCapabilitySourcingContract(CANONICAL), []);
    assert.deepEqual(loadSourcingReceipts().errors, []);
    assert.deepEqual(validateCapabilitySourcing(), []);
  });

  it('accepts a complete build receipt with a stated hard requirement', () => {
    assert.deepEqual(validateSourcingReceipt(healthyReceipt()), []);
  });

  it('deliberate red: rejects a build receipt that only renames auth as proprietary', () => {
    const receipt = healthyReceipt();
    delete receipt.hardRequirement;
    receipt.alternatives = [];
    const errors = validateSourcingReceipt(receipt);
    assert.ok(
      errors.some(
        error =>
          error.includes('build') &&
          error.includes('concrete unmet hard requirement')
      )
    );
  });

  it('deliberate red: rejects an exception the implementation author self-approves', () => {
    const receipt = healthyReceipt();
    receipt.exception = true;
    receipt.exceptionReview = {
      reviewer: receipt.author,
      decision: 'approved by myself',
    };
    const errors = validateSourcingReceipt(receipt);
    assert.ok(
      errors.some(error => error.includes('cannot review their own exception'))
    );
  });

  it('deliberate red: rejects an exception with no independent review record', () => {
    const receipt = healthyReceipt();
    receipt.exception = true;
    const errors = validateSourcingReceipt(receipt);
    assert.ok(
      errors.some(error => error.includes('independent exceptionReview'))
    );
  });

  it('deliberate red: rejects a missing-alternatives entry that claims no SDK exists', () => {
    const receipt = healthyReceipt();
    receipt.alternatives = [];
    const errors = validateSourcingReceipt(receipt);
    assert.ok(
      errors.some(
        error => error.includes('alternatives') && error.includes('non-empty')
      )
    );
  });

  it('deliberate red: rejects missing required fields and bad ids', () => {
    const errors = validateSourcingReceipt({
      id: 'made-up-id',
      disposition: 'nope',
      binding: 'flat string',
    });
    assert.ok(errors.some(error => error.includes('missing outcome')));
    assert.ok(errors.some(error => error.includes('id must match')));
    assert.ok(
      errors.some(error => error.includes('disposition must be one of'))
    );
    assert.ok(
      errors.some(error => error.includes('binding must be an object'))
    );
  });

  it('deliberate red: rejects a receipt ledger with a duplicate identity', () => {
    const dupRoot = mkdtempSync(join(tmpdir(), 'jovie-sourcing-'));
    try {
      mkdirSync(join(dupRoot, 'canon'), { recursive: true });
      const row = JSON.stringify(healthyReceipt());
      writeFileSync(
        join(dupRoot, 'canon', 'sourcing-receipts.jsonl'),
        `${row}\n${row}\n`
      );
      const { errors } = loadSourcingReceipts(dupRoot);
      assert.ok(
        errors.some(error => error.includes('duplicate receipt identity'))
      );
    } finally {
      rmSync(dupRoot, { recursive: true, force: true });
    }
  });

  it('keeps enforcement nonblocking: no error message blocks unrelated shipping', () => {
    // The shadow gate reports findings as capability-sourcing errors, but the
    // JOV-INV-035 policy pins enforcement: shadow-advisory, so promotion to a
    // required check is a separate receipt-gated decision (founder 2026-09-09).
    const receipt = healthyReceipt();
    delete receipt.binding;
    const errors = validateSourcingReceipt(receipt);
    assert.ok(errors.length > 0);
    assert.ok(
      errors.every(error =>
        error.startsWith('capability-sourcing jovie-sourcing-receipt-001')
      )
    );
  });
});

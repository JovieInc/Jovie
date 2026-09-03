import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIT_EVIDENCE_OUTCOMES,
  canonicalJson,
  digestObject,
  NON_PASS_OUTCOMES,
  sha256,
} from './contracts.mjs';

describe('provider-neutral audit contract primitives', () => {
  it('canonicalizes and hashes equivalent objects deterministically', () => {
    const left = { z: 1, nested: { b: 2, a: 1 } };
    const right = { nested: { a: 1, b: 2 }, z: 1 };
    assert.deepEqual(canonicalJson(left), canonicalJson(right));
    assert.equal(digestObject(left), digestObject(right));
    assert.match(sha256('jovie'), /^[a-f0-9]{64}$/);
  });

  it('keeps every architecture non-pass outcome explicit', () => {
    assert.deepEqual(NON_PASS_OUTCOMES, [
      'failed',
      'disagree',
      'unknown',
      'refused',
      'inconclusive',
      'error',
      'provider_unavailable',
      'budget_deferred',
      'stale_at_birth',
    ]);
    assert.deepEqual(AUDIT_EVIDENCE_OUTCOMES, [
      'satisfied',
      ...NON_PASS_OUTCOMES,
    ]);
  });
});

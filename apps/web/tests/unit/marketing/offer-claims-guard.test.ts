// Blocking unit-lane wrapper for the offer-claims guard (offer-truth design).
// Price, trial, billing, renewal, cancellation and refund prose must be a
// registered claim from lib/billing/offer; hand-written copy ratchets down.
// The scanner lives in scripts/invariants/offer-claims (also runnable alone:
// node scripts/invariants/offer-claims/check.mjs).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import baseline from '../../../../../scripts/invariants/offer-claims/baseline.json';
// @ts-expect-error plain ESM script, no types
import {
  evaluate,
  scan,
} from '../../../../../scripts/invariants/offer-claims/check.mjs';

const REPO_ROOT = join(__dirname, '../../../../..');

describe('offer claims guard', () => {
  it('has no hand-written offer claims beyond the shrinking baseline', () => {
    const errors: string[] = evaluate(scan(REPO_ROOT), baseline);
    expect(errors).toEqual([]);
  }, 120_000);
});

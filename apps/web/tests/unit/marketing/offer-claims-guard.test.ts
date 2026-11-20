// Blocking unit-lane wrapper for the offer-claims guard (offer-truth design).
// Price, trial, billing, renewal, cancellation and refund prose must be a
// registered claim from lib/billing/offer; hand-written copy ratchets down.
// The scanner lives in scripts/invariants/offer-claims (also runnable alone:
// node scripts/invariants/offer-claims/check.mjs).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '../../../../..');

describe('offer claims guard', () => {
  it('has no hand-written offer claims beyond the shrinking baseline', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/invariants/offer-claims/check.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 110_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('offer-claims: ok');
  }, 120_000);
});

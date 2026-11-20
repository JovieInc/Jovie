// Blocking unit-lane wrapper for the stat-claims guard (proof-stat registry).
// Numeric marketing claims (counts, multiples, lifts, ranks) must bind to a
// proof stat ({stat:<id>}); hand-written numbers ratchet down. The scanner
// lives in scripts/invariants/stat-claims (also runnable alone:
// node scripts/invariants/stat-claims/check.mjs).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '../../../../..');

describe('stat claims guard', () => {
  it('has no hand-written numeric claims beyond the shrinking baseline', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/invariants/stat-claims/check.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 110_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('stat-claims: ok');
  }, 120_000);
});

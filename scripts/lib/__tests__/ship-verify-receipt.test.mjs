import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('ship:verify receipt', () => {
  it('a dry run verified nothing, so it is never recorded as passed', () => {
    // Red before green: the old fold `every(status !== 'failed')` wrote
    // status "passed" and exit 0 for an all-skipped dry run.
    const out = join(mkdtempSync(join(tmpdir(), 'ship-verify-')), 'r.json');
    const run = spawnSync(
      process.execPath,
      ['scripts/ship-verify.mjs', '--dry-run', '--out', out],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    const receipt = JSON.parse(readFileSync(out, 'utf8'));
    expect(receipt.checks.length).toBeGreaterThan(0);
    expect(receipt.checks.every(check => check.status === 'skipped')).toBe(
      true
    );
    expect(receipt.status).toBe('blocked');
    expect(run.status).toBe(1);
    expect(receipt.dryRun).toBe(true);
  });
});

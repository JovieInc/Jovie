import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function run(args) {
  return spawnSync('node', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

describe('gate-ladder (JOV-3210)', () => {
  it('validates the shared ladder against live hooks and workflows', () => {
    const result = run(['scripts/gate-ladder/validate.mjs']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PASS/);
  });

  it('lists rungs including secrets and PR Ready aggregate', () => {
    const result = run(['scripts/gate-ladder/run.mjs', '--list']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /secrets/);
    assert.match(result.stdout, /aggregate/);
    assert.match(result.stdout, /typecheck/);
  });

  it('skips PR-mapping prose without executing it', () => {
    const result = run([
      'scripts/gate-ladder/run.mjs',
      '--rung',
      'aggregate',
      '--app',
      'web',
      '--phase',
      'pr',
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /documented mapping only|PR Ready/);
  });
});

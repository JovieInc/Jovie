import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { frameDigest } from './frame-identity.mjs';
import { MAX_SWEEP_ATTEMPTS, recordSweepAttempt } from './sweep-state.mjs';

test('attempt receipts persist thrown errors, preserve budgets across reloads, and reset for edits', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-attempt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tree = { id: 'F', width: 200 };
  const sweep = {
    state: /** @type {Record<string, any>} */ ({}),
    statePath: join(dir, 'state.json'),
    trees: [tree],
  };
  assert.doesNotThrow(() =>
    recordSweepAttempt(undefined, 'F', { verdict: 'error' })
  );
  for (let attempt = 1; attempt <= MAX_SWEEP_ATTEMPTS; attempt++) {
    recordSweepAttempt(sweep, 'F', { verdict: 'error' });
    sweep.state = JSON.parse(readFileSync(sweep.statePath, 'utf8'));
    assert.equal(sweep.state.F.attempts, attempt);
    assert.equal(sweep.state.F.digest, frameDigest(tree));
    assert.equal(sweep.state.F.verdict, 'error');
  }
  recordSweepAttempt(sweep, 'F', {
    verdict: 'pass',
    digestAfter: 'new-content',
  });
  assert.equal(sweep.state.F.attempts, 1);
  assert.equal(sweep.state.F.digest, 'new-content');
});

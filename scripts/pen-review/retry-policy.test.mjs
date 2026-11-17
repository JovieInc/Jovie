import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { shouldReview } from './run.mjs';
import { recordSweepAttempt } from './sweep-state.mjs';

test('unchanged failed frames exhaust three persisted automatic attempts; edits reset the budget', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-sweep-cap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const verdict of ['error', 'render-untrusted']) {
    const tree = { id: 'F', width: 200 };
    const sweep = {
      state: /** @type {Record<string, any>} */ ({}),
      statePath: join(dir, 'state.json'),
      trees: [tree],
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.equal(shouldReview(tree, sweep.state.F), true);
      recordSweepAttempt(sweep, 'F', { verdict });
      sweep.state = JSON.parse(readFileSync(sweep.statePath, 'utf8'));
      assert.equal(sweep.state.F.attempts, attempt);
    }
    assert.equal(shouldReview(tree, sweep.state.F), false);
    tree.width++;
    assert.equal(shouldReview(tree, sweep.state.F), true);
    recordSweepAttempt(sweep, 'F', { verdict });
    assert.equal(sweep.state.F.attempts, 1);
  }
});

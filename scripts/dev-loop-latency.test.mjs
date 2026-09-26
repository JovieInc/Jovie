import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  BUDGETS,
  evaluateBudgets,
  PRE_PUSH_STEP,
  parseHookSteps,
} from './dev-loop-latency.mjs';

test('parses top-level rungs and skips conditional blocks', () => {
  const steps = parseHookSteps(
    [
      '#!/usr/bin/env sh',
      'set -e',
      '# comment',
      'bash scripts/a.sh',
      'node scripts/b.mjs --staged',
      'pnpm exec lint-staged',
      'if true; then',
      '  pnpm run ios:lint',
      'fi',
    ].join('\n')
  );
  assert.deepEqual(steps, [
    'bash scripts/a.sh',
    'node scripts/b.mjs --staged',
    'pnpm exec lint-staged',
  ]);
});

test('the real pre-commit hook yields the known rungs', () => {
  const steps = parseHookSteps(
    readFileSync(resolve(import.meta.dirname, '../.husky/pre-commit'), 'utf8')
  );
  assert.ok(steps.includes('pnpm exec lint-staged'));
  assert.ok(steps.length >= 5, steps.join('\n'));
});

test('flags slow rungs, failing rungs and total overruns', () => {
  const ok = evaluateBudgets([
    { step: 'bash a.sh', seconds: 1, code: 0 },
    { step: 'pnpm exec lint-staged', seconds: 8, code: 0 },
    { step: PRE_PUSH_STEP, seconds: 4, code: 0 },
  ]);
  assert.deepEqual(ok.breaches, []);

  const slow = evaluateBudgets([
    { step: 'node skill-gate --staged', seconds: 7, code: 0 },
    { step: 'bash b.sh', seconds: 1, code: 3 },
  ]);
  assert.equal(slow.breaches.length, 2);
  assert.match(slow.breaches[0], /7\.0s > 5s/);
  assert.match(slow.breaches[1], /exited 3/);

  const total = evaluateBudgets(
    Array.from({ length: 6 }, (_, i) => ({
      step: `s${i}`,
      seconds: 4.5,
      code: 0,
    }))
  );
  assert.match(total.breaches.at(-1), /pre-commit total: 27\.0s > 25s/);
  assert.equal(BUDGETS.preCommitTotalSeconds, 25);
});

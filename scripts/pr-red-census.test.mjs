import assert from 'node:assert/strict';
import test from 'node:test';
import { census, classify } from './pr-red-census.mjs';

test('failed-run logs are attributed to the avoidable reds', () => {
  assert.deepEqual(
    classify('fleet-rules: red-before-green: include Failing command'),
    ['red-before-green']
  );
  assert.deepEqual(classify('customer changelog decision missing'), [
    'changelog',
  ]);
  assert.deepEqual(classify('component-ship-gate: no stories'), ['story']);
  assert.deepEqual(classify('unrelated vitest failure'), []);
});

test('the census counts only failed pull_request runs, bounds log reads and reports the rest', () => {
  const rows = [
    {
      databaseId: 1,
      conclusion: 'failure',
      event: 'pull_request',
      headBranch: 'a',
    },
    {
      databaseId: 2,
      conclusion: 'failure',
      event: 'pull_request',
      headBranch: 'b',
    },
    {
      databaseId: 3,
      conclusion: 'success',
      event: 'pull_request',
      headBranch: 'c',
    },
    {
      databaseId: 4,
      conclusion: 'failure',
      event: 'merge_group',
      headBranch: 'd',
    },
  ];
  const gh = args =>
    args[0] === 'run' && args[1] === 'list'
      ? JSON.stringify(args.includes('PR Fleet Rules') ? rows : [])
      : 'red-before-green: x';
  const result = census({
    hours: 24,
    maxLogs: 1,
    gh,
    now: Date.UTC(2026, 9, 25),
  });
  assert.equal(result.failedPrRuns, 2);
  assert.equal(result.logsRead, 1);
  assert.equal(result.unclassified, 1);
  assert.equal(result.causes['red-before-green'], 1);
  assert.equal(result.distinctBranches, 1);
});

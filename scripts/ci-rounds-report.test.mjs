import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchData, percentile, summarizeRounds } from './ci-rounds-report.mjs';

test('percentile uses nearest rank', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([1, 2, 3, 4], 95), 4);
});

const commit = ran => ({
  commit: {
    oid: 'x',
    checkSuites: {
      nodes: ran
        ? [{ workflowRun: { workflow: { name: 'Source Validation' } } }]
        : [],
    },
  },
});

test('a round is a PR head commit Source Validation ran on', () => {
  const summary = summarizeRounds([
    {
      number: 1,
      commits: { nodes: [commit(true), commit(false), commit(true)] },
    },
    { number: 2, commits: { nodes: [commit(true)] } },
  ]);
  assert.deepEqual(
    summary.rows.map(r => [r.number, r.commits, r.rounds]),
    [
      [1, 3, 2],
      [2, 1, 1],
    ]
  );
  assert.equal(summary.roundsP50, 1);
  assert.equal(summary.roundsP95, 2);
});

test('fetchData makes exactly one graphql call', () => {
  const calls = [];
  const nodes = fetchData({
    prs: 3,
    call: args => {
      calls.push(args);
      return {
        data: { repository: { pullRequests: { nodes: [{ number: 5 }] } } },
      };
    },
  });
  assert.deepEqual(nodes, [{ number: 5 }]);
  assert.equal(calls.length, 1);
});

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { deliverReport } from '../../shipping-slo-intake.mjs';
import { fakeGh } from './fixtures/shipping-slo-fake-gh.mjs';

const repo = 'JovieInc/Jovie';
const makeState = () => ({ issues: [], labels: [], calls: [], failure: null });
const report = (metric = 'lead_time.devin.p95') => ({
  evaluation: {
    regressions: [
      { key: metric, baseline: 100, observed: 130, changeFraction: 0.3 },
    ],
    flatStall: false,
  },
  sampled: { ciRuns: 1, mergedPrs: 0 },
  offenders: { slowestPrs: [], slowestCiRuns: [] },
});
const run = (state, id = 'oct05', input = report()) =>
  deliverReport(
    input,
    { repo, runUrl: `https://github.com/${repo}/actions/runs/${id}` },
    args => fakeGh(state, args)
  );

test('missing labels retain one issue, full recurrence evidence and replay idempotence', () => {
  const state = makeState();
  assert.equal(run(state).status, 'succeeded');
  assert.equal(run(state, 'oct07').findings[0].action, 'observed');
  assert.equal(run(state, 'oct08').findings[0].action, 'observed');
  assert.equal(run(state, 'oct08').findings[0].action, 'replayed');
  assert.equal(state.issues.length, 1);
  assert.equal(state.issues[0].comments.length, 2);
  assert.match(state.issues[0].body, /oct05/);
  assert.match(state.issues[0].comments[0].body, /oct07/);
  assert.match(state.issues[0].comments[1].body, /oct08/);
});
test('legacy unlabeled issue is reused without replacing human content or routing labels', () => {
  const state = makeState();
  state.issues.push({
    number: 42,
    title: 'slo-regression: lead_time.devin.p95 >20% over baseline',
    body: 'Human hold and original finding',
    labels: ['tim-hold'],
    comments: [],
  });
  assert.equal(run(state).findings[0].issue, 42);
  assert.equal(state.issues[0].body, 'Human hold and original finding');
  assert.deepEqual(state.issues[0].labels, ['tim-hold']);
});
test('lookup transport failure performs no create and returns visible owned failure', () => {
  const state = makeState();
  state.failure = 'lookup';
  const receipt = run(state);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.owner, 'Devin');
  assert.equal(receipt.findings[0].reason, 'issue_lookup_failed');
  assert.equal(state.issues.length, 0);
  assert(!state.calls.some(args => args[1] === 'create'));
});
test('ambiguous create is not retried; restart reconciles committed fingerprint', () => {
  const state = makeState();
  state.failure = 'create-after-write';
  assert.equal(run(state).findings[0].reason, 'create_result_unknown');
  assert.equal(state.issues.length, 1);
  assert.equal(run(state).findings[0].action, 'replayed');
  assert.equal(state.calls.filter(args => args[1] === 'create').length, 1);
});
test('ambiguous comment is not retried; restart reconciles observation marker', () => {
  const state = makeState();
  run(state);
  state.failure = 'comment-after-write';
  assert.equal(
    run(state, 'oct07').findings[0].reason,
    'comment_result_unknown'
  );
  assert.equal(run(state, 'oct07').findings[0].action, 'replayed');
  assert.equal(state.issues[0].comments.length, 1);
});
test('label lookup outage never falls back to unlabeled creation', () => {
  const state = makeState();
  state.failure = 'label-lookup';
  assert.equal(run(state).findings[0].reason, 'label_lookup_failed');
  assert.equal(state.issues.length, 0);
});
test('distinct metrics and flat-growth investigations have distinct stable identities', () => {
  const state = makeState();
  run(state);
  run(state, 'oct05', report('lead_time.codex.p95'));
  const input = report();
  input.evaluation.flatStall = true;
  run(state, 'oct05', input);
  assert.equal(state.issues.length, 3);
  assert.equal(
    new Set(
      state.issues.map(row => row.body.match(/fingerprint=([0-9a-f]+)/)[1])
    ).size,
    3
  );
});
test('duplicate canonical candidates hold without closing or mutating them', () => {
  const state = makeState();
  run(state);
  state.issues.push({ ...state.issues[0], number: 2, comments: [] });
  assert.equal(
    run(state, 'oct07').findings[0].reason,
    'ambiguous_canonical_issue'
  );
  assert.equal(state.issues.length, 2);
  assert.equal(state.issues[0].comments.length, 0);
});
test('a full comment page cannot claim complete replay lookup', () => {
  const state = makeState();
  run(state);
  state.issues[0].comments = Array.from({ length: 100 }, () => ({
    body: 'old evidence',
  }));
  assert.equal(
    run(state, 'oct07').findings[0].reason,
    'comment_lookup_failed_incomplete'
  );
  assert.equal(state.issues[0].comments.length, 100);
});
test('existing optional label is applied without making it part of identity', () => {
  const state = makeState();
  state.labels = ['slo-regression'];
  run(state);
  assert.deepEqual(state.issues[0].labels, ['slo-regression']);
  state.issues[0].labels = [];
  state.labels = [];
  run(state, 'oct07');
  assert.equal(state.issues.length, 1);
  assert.equal(state.issues[0].comments.length, 1);
});

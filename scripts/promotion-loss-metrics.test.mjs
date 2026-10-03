import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeMetrics,
  linearKey,
  parseWindow,
  percentile,
  renderMarkdown,
  toEvents,
} from './promotion-loss-metrics.mjs';

const T0 = Date.parse('2026-09-27T07:00:00Z');
const at = minutes => new Date(T0 + minutes * 60_000).toISOString();
const added = m => ({ type: 'added', at: at(m) });
const removed = m => ({ type: 'removed', at: at(m), reason: 'failed_checks' });
const merged = m => ({ type: 'merged', at: at(m) });

test('parseWindow and percentile', () => {
  assert.equal(parseWindow('8h'), 8 * 3_600_000);
  assert.equal(parseWindow('90m'), 90 * 60_000);
  assert.equal(parseWindow('1d'), 86_400_000);
  assert.throws(() => parseWindow('8 hours'), /--since/);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile([4, 1, 3, 2], 75), 3);
});

test('linearKey prefers the marker, then branch, then title', () => {
  assert.equal(
    linearKey({
      body: '<!-- linear-issue-id:JOV-1 -->',
      headRefName: 'devin/jov-2-x',
      title: 'JOV-3',
    }),
    'JOV-1'
  );
  assert.equal(
    linearKey({ headRefName: 'devin/jov-2-20260927', title: 'JOV-3' }),
    'JOV-2'
  );
  assert.equal(
    linearKey({ headRefName: 'fix/thing', title: 'fix: thing (JOV-3)' }),
    'JOV-3'
  );
  assert.equal(
    linearKey({ headRefName: 'dependabot/npm', title: 'bump x' }),
    null
  );
});

test('toEvents normalizes and orders the queue timeline', () => {
  const events = toEvents([
    { __typename: 'MergedEvent', createdAt: at(9) },
    {
      __typename: 'RemovedFromMergeQueueEvent',
      createdAt: at(9),
      reason: 'merged',
    },
    { __typename: 'AddedToMergeQueueEvent', createdAt: at(1) },
    {
      __typename: 'RemovedFromMergeQueueEvent',
      createdAt: at(4),
      reason: 'failed_checks',
    },
  ]);
  assert.deepEqual(
    events.map(event => event.type),
    ['added', 'removed', 'merged']
  );
  assert.equal(events[1].reason, 'failed_checks');
});

test('computeMetrics measures first pass, ejections, latency, intake and duplicates', () => {
  const since = T0;
  const now = T0 + 8 * 3_600_000;
  const prs = [
    // first-pass merge: opened 10, enqueued 30, merged 36
    {
      number: 1,
      state: 'MERGED',
      createdAt: at(10),
      mergedAt: at(36),
      events: [added(30), merged(36)],
    },
    // ejected at 45, fixed, re-enqueued at 105, merged 110
    {
      number: 2,
      state: 'MERGED',
      createdAt: at(20),
      mergedAt: at(110),
      events: [added(40), removed(45), added(105), merged(110)],
    },
    // ejected and still waiting for a fix push
    {
      number: 3,
      state: 'OPEN',
      createdAt: at(0),
      events: [added(50), removed(55)],
      failureReceipts: [
        {
          classification: 'deterministic-source',
          failureNumber: 2,
        },
      ],
    },
    // silently re-added (no removal recorded): outcome unknown, not counted
    {
      number: 8,
      state: 'OPEN',
      createdAt: at(-500),
      events: [added(70), added(80)],
    },
    // opened and closed as a duplicate
    { number: 4, state: 'CLOSED', createdAt: at(60), events: [] },
    // enqueued before the window: its first enqueue does not count as in-window
    {
      number: 5,
      state: 'MERGED',
      createdAt: at(-300),
      mergedAt: at(5),
      events: [added(-10), merged(5)],
    },
  ];
  const openPrs = [
    {
      number: 3,
      headRefName: 'devin/jov-9-20260927',
      isDraft: false,
      mergeStateStatus: 'CLEAN',
      isInMergeQueue: false,
    },
    {
      number: 6,
      headRefName: 'devin/jov-9-20260926',
      isDraft: true,
      mergeStateStatus: 'BLOCKED',
      isInMergeQueue: false,
    },
    {
      number: 7,
      headRefName: 'feat/x',
      title: 'x (JOV-10)',
      isDraft: false,
      mergeStateStatus: 'CLEAN',
      isInMergeQueue: true,
    },
  ];
  const runs = [
    { event: 'merge_group', conclusion: 'success', minutes: 60 },
    { event: 'merge_group', conclusion: 'failure', minutes: 30 },
    { event: 'merge_group', conclusion: 'success', minutes: 60 },
    { event: 'pull_request', conclusion: 'success', minutes: 12 },
  ];
  const m = computeMetrics({
    prs,
    openPrs,
    queue: { maxEntriesToBuild: 10 },
    runs,
    since,
    now,
  });

  assert.deepEqual(m.firstPass, { rate: 0.5, merged: 2, resolvedEntries: 4 });
  assert.deepEqual(m.ejections.byReason, { failed_checks: 2 });
  assert.equal(m.ejections.mergeGroupRuns, 3);
  assert.equal(m.ejections.mergeGroupFailed, 1);
  assert.equal(m.ejections.mergeGroupRunsPerMergedPr, 1);
  assert.equal(m.ejections.revisionFailureHolds, 1);
  assert.equal(m.ejections.deterministicFailureRecurrence, 1);
  assert.deepEqual(m.occupancy, {
    inQueue: 1,
    maxEntriesToBuild: 10,
    cleanNotQueued: 1,
  });
  assert.deepEqual(m.reenqueueMinutes, { n: 1, p50: 60, p75: 60, pending: 1 });
  assert.deepEqual(m.openToFirstEnqueueMinutes, { n: 4, p50: 20, p75: 50 });
  assert.deepEqual(m.lastEnqueueToMergedMinutes, { n: 3, p50: 6, p75: 15 });
  assert.equal(m.intake.opened, 4);
  assert.equal(m.intake.merged, 3);
  assert.equal(m.intake.closedUnmergedOfOpened, 1);
  assert.equal(m.intake.keysWithMultipleOpenPrs, 1);
  assert.equal(m.intake.prsInThoseKeys, 2);
  assert.deepEqual(m.runnerMinutesPerMergedPr, {
    pullRequest: 4,
    mergeGroup: 50,
  });

  const text = renderMarkdown(m);
  assert.match(text, /first-pass rate \| 50% \(2\/4 entries\)/);
  assert.match(text, /failed_checks 2/);
  assert.match(
    text,
    /failure holds \/ deterministic same-head recurrence \| 1 \/ 1/
  );
});

test('computeMetrics degrades to n/a on an empty window', () => {
  const m = computeMetrics({
    prs: [],
    openPrs: [],
    queue: {},
    runs: [{ event: 'pull_request', minutes: null }],
    since: T0,
    now: T0 + 3_600_000,
  });
  assert.equal(m.firstPass.rate, null);
  assert.equal(m.ejections.mergeGroupRunsPerMergedPr, null);
  assert.equal(m.runnerMinutesPerMergedPr.pullRequest, null);
  const text = renderMarkdown(m);
  assert.match(text, /first-pass rate \| n\/a/);
  assert.match(text, /removals by reason \| none/);
});

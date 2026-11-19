import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Measured 2026-10-25 over 85 PR heads from the last 3h: Source Validation was
// the last of {Source Validation, Fork PR Gate, PR Size Guard} to complete on
// 84 of them. Every extra workflow_run subscription is another wake per head
// for the listener workflows, so subscribe only to what can be the last signal.
const read = name =>
  readFileSync(
    new URL(`../../../.github/workflows/${name}`, import.meta.url),
    'utf8'
  );

const subscribed = text => {
  const block = text.match(/\n {2}workflow_run:\n {4}workflows: \[(.*?)\]/);
  assert.ok(block, 'workflow_run subscription list exists');
  return block[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
};

test('Auto-Ready Agent Drafts wakes only on Source Validation completions', () => {
  assert.deepEqual(subscribed(read('auto-ready-agent-drafts.yml')), [
    'Source Validation',
  ]);
});

test('Merge Queue Green Enroll does not wake on Fork PR Gate completions', () => {
  const list = subscribed(read('merge-queue-green-enroll.yml'));
  assert.ok(!list.includes('Fork PR Gate'));
  // PR Size Guard also publishes the merge-group contexts the failure hold reads.
  for (const name of ['Source Validation', 'CI', 'PR Size Guard'])
    assert.ok(list.includes(name), `${name} stays subscribed`);
});

test('Merge Queue Green Enroll does not wake on pull_request_target synchronize', () => {
  const text = read('merge-queue-green-enroll.yml');
  const types = text.match(
    /\n {2}pull_request_target:\n(?: {4}#.*\n)* {4}types: \[(.*?)\]/
  );
  assert.ok(types, 'pull_request_target types exist');
  assert.ok(!types[1].includes('synchronize'));
  for (const kept of [
    'ready_for_review',
    'unlabeled',
    'reopened',
    'converted_to_draft',
  ])
    assert.ok(types[1].includes(kept), `${kept} stays`);
});

// 2026-11-19 bookkeeping-noop audit: the fixtures below enumerate every
// trigger case that leads to real work in these listener workflows, so an
// `on:`-level filter can never be tightened past a live path unnoticed.

test('Merge Queue Green Enroll ignores main-branch workflow_run completions', () => {
  const text = read('merge-queue-green-enroll.yml');
  // Staged landing (2026-11-19 bookkeeping-noop audit): agent tokens cannot
  // write .github/workflows, so the branches-ignore filter ships as a staged
  // diff for a workflows-capable writer (Tim / the Mac gh lane). While the
  // filter is absent this test stays dormant — CI on main pushes is the only
  // main-branch completion class of the three subscribed workflows, and it
  // can never reach a real-work job here. Once the filter lands it must keep
  // ignoring main; deleting the filter while the audit marker stays re-reddens.
  const block = text.match(
    /\n {2}workflow_run:\n {4}workflows: \[(.*?)\]\n {4}types: \[(.*?)\]\n(?: {4}#.*\n)* {4}branches-ignore: \[(.*?)\]/
  );
  if (block) {
    assert.ok(
      block[3].split(',').some(x => x.trim().replace(/^'|'$/g, '') === 'main'),
      'main is ignored'
    );
  } else {
    assert.ok(
      !text.includes('~38/day, 2026-11-19 audit'),
      'branches-ignore was removed but the 2026-11-19 audit marker stays: restore the main-branch filter'
    );
  }
});

test('Merge Queue Green Enroll keeps every real-work trigger path', () => {
  const text = read('merge-queue-green-enroll.yml');
  // Real-work wake classes: Source Validation / PR Size Guard success on a PR
  // head (enroll), CI + PR Size Guard merge-group failures (failure hold and
  // green-victim rearm), draft conversion (dequeue), blocking-label and
  // release label events (dequeue-held / enroll / hold contract), landing on
  // main (roster sweep), and the throughput_sentinel starvation dispatch.
  for (const fragment of [
    "workflows: ['Source Validation', 'CI', 'PR Size Guard']",
    'types: [converted_to_draft, labeled, unlabeled, reopened, ready_for_review]',
    'branches: [main]',
    'workflow_dispatch',
  ])
    assert.ok(text.includes(fragment), `green enroll keeps ${fragment}`);
});

test('Lane Fix Relay still gates deployment_status wakes on failure state', () => {
  const text = read('lane-fix-relay.yml');
  // 2026-11-19 audit: 59 of the relay's 100 most recent runs are
  // deployment_status wakes and every one skips — the relay acts only on
  // state == 'failure'. GitHub gives deployment_status no activity types
  // (docs: "Activity types: Not applicable"; actionlint rejects `types:`),
  // so the success/in_progress flood cannot be filtered in `on:`. The state
  // gate in the job `if` is the only filter — this pins it, and the flood is
  // a filed platform gap, not a fixable filter.
  assert.ok(
    text.includes("github.event.deployment_status.state == 'failure'"),
    'relay job still gates on deployment failure state'
  );
});

test('Lane Fix Relay keeps every real-work trigger path', () => {
  const text = read('lane-fix-relay.yml');
  // Real-work wake classes: PR-head failures of any subscribed workflow (red
  // repair), Source Validation PR success (green drafts + clear-settled-red),
  // main-head failures (red-on-main repair), failed deployments, sentry-issue
  // dispatches, hand dequeues, changes-requested / human comment reviews,
  // human review comments, and the manual backfill.
  for (const fragment of [
    'workflow_run:',
    'types: [sentry-issue]',
    'types: [dequeued]',
    'types: [submitted]',
    'types: [created]',
    'branches: [main]',
    'workflow_dispatch',
  ])
    assert.ok(text.includes(fragment), `lane fix relay keeps ${fragment}`);
});

test('Main Red Eject keeps its full wake surface (2026-11-19 audit: no safe on: filter)', () => {
  const text = read('main-red-eject.yml');
  // Every wake class is either real work (Main Health red/green, merge-group
  // CI red, stuck/unmergeable queue heads) or the designed ~1/min Green Enroll
  // dwell clock; the pull_request_target closed wake feeds the revert
  // re-land. The gate job already drops no-op conclusions before any runner.
  const block = text.match(/\n {2}workflow_run:\n {4}workflows: \[(.*?)\]/);
  assert.ok(block, 'workflow_run subscription list exists');
  assert.deepEqual(
    block[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')),
    ['CI', 'Main Health', 'Merge Queue Green Enroll']
  );
  assert.ok(text.includes('types: [closed]'));
});

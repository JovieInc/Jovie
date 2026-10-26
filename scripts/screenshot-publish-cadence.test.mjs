import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decideScreenshotPublish } from '../.github/scripts/screenshot-publish-cadence.mjs';

const now = '2026-10-25T12:00:00Z';

test('open PR is always updated (no new queue slot)', () => {
  const r = decideScreenshotPublish({
    openPrNumber: 5,
    lastMergedAt: now,
    now,
  });
  assert.equal(r.publish, true);
  assert.equal(r.slotSaved, false);
});

test('a new PR within 24h of the last merge is batched', () => {
  const r = decideScreenshotPublish({
    lastMergedAt: '2026-10-25T02:00:00Z',
    now,
  });
  assert.deepEqual(
    [r.publish, r.slotSaved, r.reason],
    [false, true, 'batched_within_window']
  );
});

test('a new PR after the window publishes', () => {
  assert.equal(
    decideScreenshotPublish({ lastMergedAt: '2026-10-24T11:00:00Z', now })
      .publish,
    true
  );
});

test('fails open on missing or malformed history', () => {
  assert.equal(decideScreenshotPublish({ now }).publish, true);
  assert.equal(
    decideScreenshotPublish({ lastMergedAt: 'garbage', now }).publish,
    true
  );
});

test('screenshots workflow consults the cadence gate before creating the branch', () => {
  const wf = readFileSync('.github/workflows/screenshots.yml', 'utf8');
  const gate = wf.indexOf('screenshot-publish-cadence.mjs');
  assert.ok(gate > 0, 'cadence gate not wired');
  assert.ok(
    gate < wf.indexOf('git checkout -b "$BRANCH"'),
    'gate must run before the branch is created'
  );
});

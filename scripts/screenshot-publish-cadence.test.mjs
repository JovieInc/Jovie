import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('workflow history lookup uses the shared API budget and preserves fail-open output', () => {
  const workflow = readFileSync('.github/workflows/screenshots.yml', 'utf8');
  const lookup = workflow.match(/LAST_MERGED=\$\([\s\S]*?\)\n/)?.[0];
  assert.ok(lookup, 'merged PR lookup must remain executable');
  for (const exitCode of [0, 1]) {
    const fixture = mkdtempSync(join(tmpdir(), 'screenshot-cadence-'));
    try {
      writeFileSync(
        join(fixture, 'gh'),
        `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)));
if (process.env.LOOKUP_EXIT === '0') process.stdout.write(process.env.MERGED_AT);
process.exit(Number(process.env.LOOKUP_EXIT));
`,
        { mode: 0o755 }
      );
      const result = spawnSync(
        'bash',
        ['-euo', 'pipefail', '-c', `${lookup}printf '%s' "$LAST_MERGED"`],
        {
          encoding: 'utf8',
          env: {
            PATH: `${fixture}:${process.env.PATH}`,
            BRANCH: 'screenshots/auto-update',
            GH_TOKEN: 'screenshot-cadence-test-token',
            JOVIE_API_STATE_DIR: fixture,
            CALL_LOG: join(fixture, 'call.json'),
            LOOKUP_EXIT: String(exitCode),
            MERGED_AT: now,
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, exitCode === 0 ? now : '');
      assert.deepEqual(
        JSON.parse(readFileSync(join(fixture, 'call.json'), 'utf8')),
        [
          'pr',
          'list',
          '--head',
          'screenshots/auto-update',
          '--state',
          'merged',
          '--limit',
          '1',
          '--json',
          'mergedAt',
          '-q',
          '.[0].mergedAt',
        ]
      );
      const ledger = JSON.parse(
        readFileSync(join(fixture, 'api-ledger/github.json'), 'utf8')
      );
      const credentials = Object.values(ledger.credentials);
      assert.equal(credentials.length, 1);
      assert.equal(Object.keys(credentials[0].usage).length, 1);
      assert.deepEqual(Object.keys(Object.values(credentials[0].usage)[0]), [
        'default',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

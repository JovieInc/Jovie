import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { deferralReason } from './pen-draft-quota.mjs';

test('a quota refusal is read from the agent transcript, with its reset', () => {
  // Run 43621008907: the refusal was only in the job log, so the receipt
  // read "Command failed: npx" and the run retried a hopeless call.
  assert.deepEqual(
    deferralReason(
      "You've hit your weekly limit · resets Nov 21, 5am (UTC)\nAgent failed: rate_limit\n"
    ),
    {
      reason: 'rate_limit',
      reset: 'Nov 21, 5am (UTC)',
      detail: "You've hit your weekly limit · resets Nov 21, 5am (UTC)",
    }
  );
  assert.deepEqual(deferralReason('Agent failed: rate_limit'), {
    reason: 'rate_limit',
    reset: null,
    detail: 'Agent failed: rate_limit',
  });
  assert.equal(deferralReason('Command failed: npx'), null);
  assert.equal(
    deferralReason('Batch design process timed out after 55000ms'),
    null
  );
  assert.equal(deferralReason(''), null);
});

test('a quota refusal defers the frame and the frames after it, without a retry', () => {
  const work = mkdtempSync(join(tmpdir(), 'pen-defer-'));
  const preload = join(work, 'defer.mjs');
  const summary = join(work, 'summary.md');
  const pens = join(work, 'pens');
  writeFileSync(
    preload,
    `
    import cp from 'node:child_process';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    let now = 0;
    Date.now = () => now;
    cp.spawnSync = (command, args, options) => {
      fs.appendFileSync(${JSON.stringify(pens)}, 'pen\\n');
      now += 3 * 60_000;
      return {
        status: 1,
        error: null,
        stdout: "You've hit your weekly limit · resets Nov 21, 5am (UTC)\\nAgent failed: rate_limit\\n",
        stderr: '',
      };
    };
    syncBuiltinESMExports();
  `
  );
  const out = join(work, 'out');
  let failed = null;
  try {
    execFileSync(
      process.execPath,
      [
        '--import',
        preload,
        resolve('scripts/design/pen-draft.mjs'),
        '--out',
        out,
        '--only',
        'claim,homepage',
      ],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: summary,
          PEN_CLI_KEY: 'fixture',
          PEN_DRAFT_TRIM: '0',
          PEN_GOLDEN_PATH_FILE_URL: `data:application/json,${encodeURIComponent(JSON.stringify({ children: [] }))}`,
        },
      }
    );
  } catch (error) {
    failed = error;
  }
  // A deferred frame is not a drafted one: the run stays red.
  assert.ok(failed, 'the run exits nonzero while frames are deferred');
  assert.equal(failed.status, 1);
  // Only claim reached the agent; homepage was deferred without a call.
  assert.equal(readFileSync(pens, 'utf8'), 'pen\n');
  const { drafts } = JSON.parse(
    readFileSync(join(out, 'receipt.json'), 'utf8')
  );
  assert.deepEqual(
    drafts.map(d => [d.frame, d.status]),
    [
      ['claim', 'deferred'],
      ['homepage', 'deferred'],
    ]
  );
  assert.equal(drafts[0].attempts, 1);
  assert.deepEqual(drafts[0].deferred, {
    reason: 'rate_limit',
    reset: 'Nov 21, 5am (UTC)',
    detail: "You've hit your weekly limit · resets Nov 21, 5am (UTC)",
  });
  assert.equal(drafts[1].attempts, undefined);
  assert.equal(drafts[1].deferred.reason, 'rate_limit');
  const summaryText = readFileSync(summary, 'utf8');
  assert.match(summaryText, /### Deferred: claim/);
  assert.match(summaryText, /### Deferred: homepage/);
  assert.match(summaryText, /Resets: Nov 21, 5am/);
});

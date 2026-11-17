import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  artifacts,
  fakeNetwork,
  publish,
  RUN_URL,
} from './pen-draft-publish.fixtures.mjs';
import {
  DEFERRED_TITLE,
  deferralCommentBody,
  publishDeferredNote,
} from './pen-draft-publish.mjs';
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

test('the first deferral creates the standing issue; without a key it fails', async () => {
  const refusal = { reason: 'rate_limit', reset: 'Nov 21, 5am', detail: null };
  const dir = artifacts({
    'pen-draft-request-access': [
      [
        'receipt.json',
        JSON.stringify({
          schema: 'jovie.pen-draft/v1',
          drafts: [
            { frame: 'request-access', status: 'deferred', deferred: refusal },
          ],
        }),
      ],
    ],
  });
  const network = fakeNetwork();
  const created = await publish(dir, network);
  assert.equal(created.ok, true);
  const create = network.calls.find(
    call => call.op === 'PenDraftDeferredCreate'
  );
  assert.ok(create, 'the standing issue was created once');
  assert.equal(create.variables.input.title, DEFERRED_TITLE);
  assert.equal(
    network.calls.filter(call => call.op === 'PenDraftDeferredCreate').length,
    1
  );
  const comments = network.calls.filter(
    call => call.op === 'PenDraftDeferredComment'
  );
  assert.equal(comments.length, 1);
  assert.equal(comments[0].variables.id, 'deferred-0');
  assert.equal(
    comments[0].variables.body,
    deferralCommentBody({
      deferred: [{ frame: 'request-access', deferred: refusal }],
      runUrl: RUN_URL,
    })
  );
  assert.equal((await publish(dir, network)).ok, true);
  assert.equal(
    network.calls.filter(call => call.op === 'PenDraftDeferredCreate').length,
    1
  );
  assert.equal(
    network.calls.filter(call => call.op === 'PenDraftDeferredComment').length,
    2
  );
  // No key: the deferral note cannot be posted, so the run is red.
  const noKey = await publish(dir, network, { apiKey: undefined, env: {} });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.reason, 'missing_linear_api_key');
});

test('other infrastructure failures are not drafting-agent quota', () => {
  for (const output of [
    'GitHub API error: rate_limit exceeded during setup',
    'npm ERR! usage limit reached for registry',
    'Cursor: no associated user',
    'Agent failed: billing_error',
  ])
    assert.equal(deferralReason(output), null, output);
});

test('a first deferral needs an issue id and one successful comment', async () => {
  for (const mode of ['missing-id', 'rejected-comment', 'uncertain-comment']) {
    const network = fakeNetwork();
    let comments = 0;
    const result = await publishDeferredNote(
      {
        apiKey: 'lin_api_test',
        env: {
          LINEAR_COOLDOWN_STATE_DIR: mkdtempSync(join(tmpdir(), 'pen-note-')),
        },
        sleep: async () => {},
        log: () => {},
        fetchImpl: async (url, init) => {
          const { query } = JSON.parse(String(init.body));
          if (
            query.includes('mutation PenDraftDeferredCreate') &&
            mode === 'missing-id'
          )
            return Response.json({
              data: { issueCreate: { success: true, issue: {} } },
            });
          if (query.includes('mutation PenDraftDeferredComment')) {
            comments += 1;
            if (mode === 'uncertain-comment')
              throw new Error('transport interrupted');
            return Response.json({
              data: { commentCreate: { success: false } },
            });
          }
          return network.fetchImpl(url, init);
        },
      },
      {
        deferred: [{ frame: 'claim', deferred: { reason: 'rate_limit' } }],
        runUrl: RUN_URL,
      }
    );
    assert.equal(result.ok, false, mode);
    assert.deepEqual(result, {
      ok: false,
      reason: {
        'missing-id': 'pen_issue_id_missing',
        'rejected-comment': 'pen_comment_create_unsuccessful',
        'uncertain-comment': 'pen_comment_create_transport',
      }[mode],
    });
    assert.equal(
      comments,
      mode === 'missing-id' ? 0 : 1,
      'never retry an uncertain write'
    );
  }
});

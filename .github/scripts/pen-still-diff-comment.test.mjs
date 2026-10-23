import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMMENT_MARKER,
  upsertTriptychComment,
} from './pen-still-diff-comment.mjs';

function fixture(t, { body = COMMENT_MARKER, withImage = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-comment-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bodyFile = join(dir, 'comment.md');
  const image = join(dir, 'triptych.png');
  writeFileSync(bodyFile, body);
  if (withImage) writeFileSync(image, 'png');
  return { pr: '12', repo: 'JovieInc/Jovie', bodyFile, image };
}

const success = stdout => ({ code: 0, stdout, stderr: '', deferred: false });

test('upsert budgets every request and posts before deleting previous marker comments', async t => {
  const calls = [];
  const exec = async (args, options) => {
    assert.deepEqual(options, { priority: 'report', maxWaitMs: 5_000 });
    calls.push(args);
    return success(
      args[0] === 'api' && args[1] === '--paginate'
        ? JSON.stringify([
            { id: 7, body: `old\n${COMMENT_MARKER}` },
            { id: 8, body: 'unrelated' },
            { id: 9, body: null },
            { id: 10, body: COMMENT_MARKER },
          ])
        : ''
    );
  };
  const input = fixture(t);
  const result = await upsertTriptychComment({ ...input, exec });
  assert.deepEqual(result, { posted: true, removed: 2 });
  assert.deepEqual(calls, [
    ['api', '--paginate', 'repos/JovieInc/Jovie/issues/12/comments'],
    [
      'pr',
      'comment',
      '12',
      '--repo',
      'JovieInc/Jovie',
      '--body-file',
      input.bodyFile,
      '--attach',
      `${input.image}#Pen, render, and diff`,
    ],
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/7'],
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/10'],
  ]);
});

test('upsert posts text only when the optional image is absent', async t => {
  const calls = [];
  const exec = async args => {
    calls.push(args);
    return success('[]');
  };
  assert.deepEqual(
    await upsertTriptychComment({ ...fixture(t, { withImage: false }), exec }),
    { posted: true, removed: 0 }
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].includes('--attach'), false);
});

test('upsert rejects an unmarked body before making any requests', async t => {
  await assert.rejects(
    () =>
      upsertTriptychComment({
        ...fixture(t, { body: 'unrelated' }),
        exec: async () => assert.fail('unexpected request'),
      }),
    /missing the pen-still marker/
  );
});

for (const [stage, failedCall, code, deferred, stderr, message] of [
  ['listing', 1, 1, false, 'list denied', /list denied/],
  ['posting', 2, 1, false, 'post denied', /post denied/],
  ['deletion', 3, 1, false, 'delete denied', /delete denied/],
  ['budget deferral', 1, 75, true, 'quota deferred', /quota deferred/],
  ['failure without stderr', 2, 1, false, '', /gh exited with code 1/],
]) {
  test(`upsert stops on ${stage} failure from the shared client`, async t => {
    let calls = 0;
    const exec = async (args, options) => {
      assert.ok(Array.isArray(args));
      assert.deepEqual(options, { priority: 'report', maxWaitMs: 5_000 });
      calls += 1;
      if (calls === failedCall) return { code, stdout: '', stderr, deferred };
      return success(JSON.stringify([{ id: 7, body: COMMENT_MARKER }]));
    };
    await assert.rejects(
      () => upsertTriptychComment({ ...fixture(t), exec }),
      message
    );
    assert.equal(calls, failedCall);
  });
}

function runCli(t, { mode = 'success', pr = '12', body = true } = {}) {
  const input = fixture(t);
  const dir = dirname(input.bodyFile);
  if (!body) rmSync(input.bodyFile);
  const callsFile = join(dir, 'calls.jsonl');
  writeFileSync(
    join(dir, 'gh'),
    `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.PEN_TEST_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'pr' && (process.env.PEN_TEST_MODE === 'deny' ||
    (process.env.PEN_TEST_MODE === 'text-only' && args.includes('--attach')))) {
  process.stderr.write('permission denied');
  process.exit(1);
}
if (args.includes('--paginate')) {
  process.stdout.write(JSON.stringify([{ id: 7, body: '<!-- pen-still-diff -->' }]));
}
`,
    { mode: 0o755 }
  );
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./pen-still-diff-comment.mjs', import.meta.url))],
    {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PR_NUMBER: pr,
        GITHUB_REPOSITORY: input.repo,
        PEN_STILL_OUT: dir,
        JOVIE_API_STATE_DIR: dir,
        GH_TOKEN: 'pen-still-test-token',
        PEN_TEST_CALLS: callsFile,
        PEN_TEST_MODE: mode,
      },
    }
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const calls = existsSync(callsFile)
    ? readFileSync(callsFile, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    : [];
  return { ...result, calls, dir };
}

test('CLI awaits the shared client and records real ledger usage before exiting', t => {
  const result = runCli(t);
  assert.deepEqual(JSON.parse(result.stdout), { posted: true, removed: 1 });
  assert.equal(result.calls.length, 3);
  assert.ok(result.calls[1].includes('--attach'));
  assert.ok(result.calls[2].includes('DELETE'));
  assert.ok(existsSync(join(result.dir, 'api-ledger', 'github.json')));
});

test('CLI falls back to text after an attachment failure, then removes the old comment', t => {
  const result = runCli(t, { mode: 'text-only' });
  assert.match(result.stderr, /triptych attach failed/);
  assert.equal(result.calls.length, 5);
  assert.ok(result.calls[1].includes('--attach'));
  assert.equal(result.calls[3].includes('--attach'), false);
  assert.ok(result.calls[4].includes('DELETE'));
});

test('CLI remains advisory and preserves old comments when both posting attempts fail', t => {
  const result = runCli(t, { mode: 'deny' });
  assert.match(result.stderr, /comment skipped: permission denied/);
  assert.equal(result.calls.length, 4);
  assert.ok(result.calls.every(args => !args.includes('DELETE')));
});

test('CLI skips missing PR context without making requests', t => {
  const result = runCli(t, { pr: '' });
  assert.match(result.stderr, /PR_NUMBER or GITHUB_REPOSITORY missing/);
  assert.deepEqual(result.calls, []);
});

test('CLI skips missing comment artifacts without making requests', t => {
  const result = runCli(t, { body: false });
  assert.match(result.stderr, /comment.md missing/);
  assert.deepEqual(result.calls, []);
});

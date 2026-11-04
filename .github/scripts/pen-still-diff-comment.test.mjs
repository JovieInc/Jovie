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
  encodePng,
  syntheticPair,
} from '../../scripts/invariants/pen-still-diff-lib.mjs';

import {
  COMMENT_MARKER,
  upsertTriptychComment,
} from './pen-still-diff-comment.mjs';

function fixture(
  t,
  { body = `${COMMENT_MARKER}\n![sample](triptych.png)`, withImage = true } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-comment-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bodyFile = join(dir, 'comment.md');
  const image = join(dir, 'triptych.png');
  writeFileSync(bodyFile, body);
  if (withImage) writeFileSync(image, encodePng(syntheticPair().pen));
  return { pr: '12', repo: 'JovieInc/Jovie', bodyFile, image };
}

const success = stdout => ({ code: 0, stdout, stderr: '', deferred: false });

test('upsert reads multi-page comments and deletes only prior marker comments after posting', async t => {
  const pages = [
    [
      { id: 7, body: COMMENT_MARKER },
      { id: 8, body: 'unrelated first page' },
    ],
    [
      { id: 9, body: null },
      { id: 10, body: `old\n${COMMENT_MARKER}` },
    ],
    [],
  ];
  const calls = [];
  const exec = async args => {
    calls.push(args);
    if (args.includes('--paginate')) {
      // --jq @json emits one compact page per line, including escaped body newlines.
      return success(
        pages
          .map(page =>
            JSON.stringify(page, null, args.includes('--jq') ? 0 : 2)
          )
          .join('\n')
      );
    }
    if (args.includes('--help')) return success('--attach <file>');
    if (args[0] === 'pr') inspectPost(args);
    return success('');
  };
  const result = await upsertTriptychComment({ ...fixture(t), exec });
  assert.deepEqual(result, { posted: true, removed: 2 });
  assert.deepEqual(calls[0], [
    'api',
    '--paginate',
    '--jq',
    '@json',
    'repos/JovieInc/Jovie/issues/12/comments',
  ]);
  assert.deepEqual(calls[1], ['pr', 'comment', '--help']);
  assert.equal(calls[2][0], 'pr');
  assert.equal(calls[2].filter(arg => arg === '--attach').length, 1);
  assert.deepEqual(calls.slice(3), [
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/7'],
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/10'],
  ]);
});

test('upsert budgets every request and posts before deleting previous marker comments', async t => {
  const calls = [];
  const exec = async (args, options) => {
    assert.deepEqual(options, { priority: 'report', maxWaitMs: 5_000 });
    calls.push(args);
    if (args.includes('--help')) return success('--attach <file>');
    if (args[0] === 'pr') inspectPost(args);
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
  assert.deepEqual(calls[0], [
    'api',
    '--paginate',
    '--jq',
    '@json',
    'repos/JovieInc/Jovie/issues/12/comments',
  ]);
  assert.deepEqual(calls[1], ['pr', 'comment', '--help']);
  assert.equal(calls[2].filter(arg => arg === '--attach').length, 1);
  assert.deepEqual(calls.slice(3), [
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/7'],
    ['api', '-X', 'DELETE', 'repos/JovieInc/Jovie/issues/comments/10'],
  ]);
});

test('older CLI without slurp or attachments can publish text after paginated listing', async t => {
  const calls = [];
  const exec = async args => {
    calls.push(args);
    if (args.includes('--slurp'))
      return {
        code: 1,
        stdout: '',
        stderr: 'unknown flag: --slurp',
        deferred: false,
      };
    if (args.includes('--paginate'))
      return success(
        `${JSON.stringify([{ id: 7, body: COMMENT_MARKER }])}\n[]\n`
      );
    if (args.includes('--help'))
      return success('Usage: gh pr comment --body-file');
    if (args[0] === 'pr') {
      const post = inspectPost(args);
      assert.deepEqual(post.attachments, []);
      assert.doesNotMatch(post.body, /!\[/);
    }
    return success('');
  };
  assert.deepEqual(await upsertTriptychComment({ ...fixture(t), exec }), {
    posted: true,
    removed: 1,
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3], [
    'api',
    '-X',
    'DELETE',
    'repos/JovieInc/Jovie/issues/comments/7',
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
      () =>
        upsertTriptychComment({
          ...fixture(t, { body: COMMENT_MARKER }),
          exec,
        }),
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
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.PEN_TEST_CALLS, JSON.stringify(args) + '\\n');
if (args.includes('--help')) { process.stdout.write('--attach <file>'); process.exit(0); }
if (args.includes('--body-file')) {
  const body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
  if (!args.includes('--attach') && body.includes('![')) throw new Error('broken fallback embed');
}
if (args[0] === 'pr' && (process.env.PEN_TEST_MODE === 'deny' ||
    (process.env.PEN_TEST_MODE === 'text-only' && args.includes('--attach')))) {
  process.stderr.write('permission denied; no comment was posted');
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
  assert.equal(result.calls.length, 4);
  assert.ok(result.calls[2].includes('--attach'));
  assert.ok(result.calls[3].includes('DELETE'));
  assert.ok(existsSync(join(result.dir, 'api-ledger', 'github.json')));
});

test('CLI falls back to text after an attachment failure, then removes the old comment', t => {
  const result = runCli(t, { mode: 'text-only' });
  assert.deepEqual(JSON.parse(result.stdout), { posted: true, removed: 1 });
  assert.equal(result.calls.length, 5);
  assert.ok(result.calls[2].includes('--attach'));
  assert.equal(result.calls[3].includes('--attach'), false);
  assert.ok(result.calls[4].includes('DELETE'));
});

test('CLI remains advisory and preserves old comments when both posting attempts fail', t => {
  const result = runCli(t, { mode: 'deny' });
  assert.match(result.stderr, /comment update failed: permission denied/);
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

// Integration fixtures are generated pixels only, never native/private stills.
async function generatedArtifacts(t, count) {
  const input = fixture(t);
  const root = dirname(input.bodyFile);
  const { encodePng, syntheticPair } = await import(
    '../../scripts/invariants/pen-still-diff-lib.mjs'
  );
  const frames = Array.from({ length: count || 1 }, (_, index) => {
    const { pen } = syntheticPair();
    pen.data[0] ^= index * 31;
    const stillPath = `${index}.png`;
    writeFileSync(join(root, stillPath), encodePng(pen));
    return {
      sectionId: `fixture-${index}`,
      mode: 'dark',
      viewport: 1440,
      penNodeId: `fixture-${index}`,
      status: count ? 'active' : 'parked',
      stillPath,
      route: '/',
    };
  });
  const manifest = join(root, 'manifest.json');
  writeFileSync(
    manifest,
    JSON.stringify({ schema: 'pen-still-manifest/v1', frames })
  );
  const moduleUrl = new URL(
    '../../scripts/invariants/pen-still-diff.mjs',
    import.meta.url
  ).href;
  const script = `import { main } from ${JSON.stringify(moduleUrl)};
    import { readFileSync } from 'node:fs'; import { join } from 'node:path';
    await main(process.argv.slice(1), { root: ${JSON.stringify(root)},
      capture: async frame => ({ png: readFileSync(join(${JSON.stringify(root)}, frame.stillPath)) }) });`;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script,
      '--',
      '--manifest',
      manifest,
      '--out',
      root,
      '--base-url',
      'http://fixture.invalid',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return input;
}

function inspectPost(args) {
  const bodyFile = args[args.indexOf('--body-file') + 1];
  const body = readFileSync(bodyFile, 'utf8');
  const attachments = args.flatMap((arg, i) =>
    arg === '--attach' ? [args[i + 1].split('#')[0]] : []
  );
  const references = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match =>
    join(dirname(bodyFile), match[1])
  );
  assert.deepEqual(
    [...new Set(references)].sort(),
    [...attachments].sort(),
    'every embed must have exactly one matching attachment'
  );
  return { bodyFile, body, attachments };
}

for (const count of [0, 1, 3])
  test(`publisher integration attaches generated ${count || 'synthetic'} image names and exact bytes`, async t => {
    const input = await generatedArtifacts(t, count);
    const originalBody = readFileSync(input.bodyFile, 'utf8');
    let posted = false;
    await upsertTriptychComment({
      ...input,
      exec: async args => {
        if (args.includes('--help')) return success('--attach <file>');
        if (args[0] === 'api') return success('[]');
        const { body, attachments } = inspectPost(args);
        assert.equal(attachments.length, count || 1);
        for (const path of attachments) {
          const name = path.split('/').at(-1);
          assert.notEqual(name, 'triptych.png');
          assert.deepEqual(
            readFileSync(path),
            readFileSync(join(dirname(input.bodyFile), name))
          );
        }
        if (!count) assert.match(body, /not design evidence/);
        posted = true;
        return success('');
      },
    });
    assert.equal(posted, true);
    assert.equal(readFileSync(input.bodyFile, 'utf8'), originalBody);
  });

test('publisher strips unsafe, missing, symlink and non-PNG embeds without attaching outside bytes', async t => {
  const input = await generatedArtifacts(t, 0);
  const { symlinkSync, mkdirSync } = await import('node:fs');
  const dir = dirname(input.bodyFile);
  const link = `triptych-${'a'.repeat(64)}.png`;
  symlinkSync(input.image, join(dir, link));
  const directory = `triptych-${'b'.repeat(64)}.png`;
  mkdirSync(join(dir, directory));
  const invalid = `triptych-${'c'.repeat(64)}.png`;
  writeFileSync(join(dir, invalid), 'not a PNG');
  const targets = [
    '../triptych.png',
    '/tmp/triptych.png',
    'https://example.com/private.png',
    '%2e%2e/triptych.png',
    'sub/triptych.png',
    'triptych.png#fragment',
    `triptych-${'d'.repeat(64)}.png`,
    'absent.png',
    link,
    directory,
    invalid,
  ];
  writeFileSync(
    input.bodyFile,
    `${COMMENT_MARKER}\nPrivate design warning.\n${targets.map(path => `![unsafe](${path})`).join('\n')}\n<img src="file:///private.png">`
  );
  await upsertTriptychComment({
    ...input,
    exec: async args => {
      if (args.includes('--help')) return success('--attach <file>');
      if (args[0] === 'api') return success('[]');
      const post = inspectPost(args);
      assert.equal(post.attachments.length, 0);
      assert.doesNotMatch(post.body, /!\[|<img/);
      assert.match(post.body, /Private design warning/);
      return success('');
    },
  });
});

test('publisher caps unique attachments at 50 and keeps all source artifacts', async t => {
  const input = await generatedArtifacts(t, 0);
  const dir = dirname(input.bodyFile);
  const png = readFileSync(join(dir, 'synthetic-triptych.png'));
  const names = Array.from(
    { length: 51 },
    (_, i) => `triptych-${i.toString(16).padStart(64, '0')}.png`
  );
  for (const name of names) writeFileSync(join(dir, name), png);
  writeFileSync(
    input.bodyFile,
    `${COMMENT_MARKER}\n${[...names, names[0]].map(name => `![sample](${name})`).join('\n')}`
  );
  await upsertTriptychComment({
    ...input,
    exec: async args => {
      if (args.includes('--help')) return success('--attach <file>');
      if (args[0] === 'api') return success('[]');
      const post = inspectPost(args);
      assert.equal(post.attachments.length, 50);
      assert.match(post.body, /artifact/i);
      return success('');
    },
  });
  for (const name of names)
    assert.deepEqual(readFileSync(join(dir, name)), png);
});

for (const mode of [
  'unsupported',
  'help-failure',
  'upload-denied',
  'unknown-flag',
  'uncertain',
])
  test(`publisher ${mode} behavior preserves honest image delivery`, async t => {
    const input = await generatedArtifacts(t, 0);
    let posts = 0;
    let deletes = 0;
    const run = () =>
      upsertTriptychComment({
        ...input,
        exec: async args => {
          if (args.includes('--help'))
            return mode === 'help-failure'
              ? { code: 1, stdout: '', stderr: 'help failed', deferred: false }
              : success(
                  mode === 'unsupported'
                    ? 'no attachment support'
                    : '--attach <file>'
                );
          if (args.includes('DELETE')) {
            deletes++;
            return success('');
          }
          if (args[0] === 'api')
            return success(JSON.stringify([{ id: 7, body: COMMENT_MARKER }]));
          posts++;
          const post = inspectPost(args);
          if (post.attachments.length)
            return {
              code: 1,
              stdout: '',
              deferred: false,
              stderr:
                mode === 'uncertain'
                  ? 'connection reset'
                  : mode === 'unknown-flag'
                    ? 'unknown flag: --attach'
                    : 'attaching files requires write access; no comment was posted',
            };
          assert.doesNotMatch(post.body, /!\[|uploaded|hosted/i);
          assert.match(post.body, /not design evidence/);
          assert.match(post.body, /artifact/i);
          return success('');
        },
      });
    if (mode === 'uncertain') {
      await assert.rejects(run, /connection reset/);
      assert.equal(posts, 1);
      assert.equal(deletes, 0);
    } else {
      await run();
      assert.equal(
        posts,
        ['upload-denied', 'unknown-flag'].includes(mode) ? 2 : 1
      );
      assert.equal(deletes, 1);
    }
  });

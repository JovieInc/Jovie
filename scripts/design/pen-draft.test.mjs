import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  draftProblem,
  loadBriefs,
  missingOutputs,
  missingSecrets,
  parseBrief,
  penArgs,
} from './pen-draft.mjs';

test('every checked-in brief parses and names a unique frame', () => {
  const briefs = loadBriefs();
  assert.deepEqual(
    briefs.map(b => b.frame),
    ['billing-success', 'claim', 'homepage', 'request-access']
  );
  for (const b of briefs) assert.ok(b.prompt.length > 100, b.frame);
});

test('a brief without front matter or a bad frame name is rejected', () => {
  assert.throws(() => parseBrief('just text', 'x.md'), /front matter/);
  assert.throws(
    () => parseBrief('---\nframe: Bad Name\n---\nbody', 'x.md'),
    /kebab/
  );
});

test('pen draws into its own file from the canonical input and keeps other frames', () => {
  const args = penArgs(
    { frame: 'claim', route: '/x', prompt: 'P' },
    { input: 'c.pen', outDir: 'o' }
  );
  assert.deepEqual(args.slice(0, 6), [
    '-y',
    '@pen.dev/cli@0.3.14',
    '--in',
    'c.pen',
    '--out',
    'o/claim.pen',
  ]);
  assert.match(
    args[args.indexOf('--prompt') + 1],
    /Leave every existing frame untouched/
  );
  assert.equal(args[args.indexOf('--export') + 1], 'o/claim.png');
});

test('missing secrets are named, so a blocked run never reads as done', () => {
  assert.deepEqual(missingSecrets({}), [
    'PEN_CLI_KEY',
    'PEN_GOLDEN_PATH_FILE_URL',
  ]);
  assert.deepEqual(
    missingSecrets({ PEN_CLI_KEY: 'k', PEN_GOLDEN_PATH_FILE_URL: 'u' }),
    []
  );
});

test('a frame without its .pen or preview is not drafted', () => {
  const b = { frame: 'claim' };
  assert.deepEqual(
    missingOutputs(b, 'o', () => true),
    []
  );
  assert.deepEqual(
    missingOutputs(b, 'o', p => String(p).endsWith('.pen')),
    ['claim.png']
  );
});

test('a blocked run names the missing secrets as a CI annotation', () => {
  const out = mkdtempSync(join(tmpdir(), 'pen-draft-blocked-'));
  const res = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./pen-draft.mjs', import.meta.url)), '--out', out],
    {
      encoding: 'utf8',
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'true' },
    }
  );
  assert.equal(res.status, 1);
  assert.match(
    res.stdout,
    /^::error title=pen-draft blocked::pen-draft: blocked, missing PEN_CLI_KEY and PEN_GOLDEN_PATH_FILE_URL$/m
  );
  assert.equal(
    JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8')).blocked,
    'missing PEN_CLI_KEY and PEN_GOLDEN_PATH_FILE_URL'
  );
});

test('a draft counts only when it adds the named top-level frame', () => {
  const before = { children: [{ id: 'a', name: 'pricing' }] };
  const added = { children: [...before.children, { id: 'b', name: 'claim' }] };
  assert.equal(draftProblem(before, added, 'claim'), null);
  assert.equal(
    draftProblem(before, before, 'claim'),
    'no new top-level frame claim'
  );
  assert.equal(
    draftProblem(before, null, 'claim'),
    'pen output is not a Pen file'
  );
});

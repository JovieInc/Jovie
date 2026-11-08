import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalKind,
  draftProblem,
  loadBriefs,
  locatePen,
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

test('the canonical download is named by its shape, so a web page never reaches pen', () => {
  assert.equal(canonicalKind(Buffer.from([0x1f, 0x8b, 8, 0])), 'archive');
  assert.equal(canonicalKind(Buffer.from('  {"children":[]}')), 'pen');
  assert.equal(canonicalKind(Buffer.from('<!DOCTYPE html><html>')), 'html');
  assert.equal(canonicalKind(Buffer.from('<html lang="en">')), 'html');
  assert.equal(canonicalKind(Buffer.from('PK\u0003\u0004')), 'unknown');
});

test('a workspace archive drafts from the manifest .pen, else the first', () => {
  const tree = {
    w: [
      { name: 'other.pen', isDirectory: () => false },
      { name: 'fonts', isDirectory: () => true },
    ],
    'w/fonts': [{ name: 'canonical.lib.pen', isDirectory: () => false }],
  };
  const list = d => tree[d] ?? [];
  assert.equal(
    locatePen('w', 'canonical.lib.pen', list),
    'w/fonts/canonical.lib.pen'
  );
  assert.equal(locatePen('w', 'missing.pen', list), 'w/other.pen');
  assert.equal(locatePen('empty', 'x.pen', list), null);
});

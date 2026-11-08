import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import {
  draftProblem,
  loadBriefs,
  missingOutputs,
  missingSecrets,
  parseBrief,
  penArgs,
  writeCanonical,
} from './pen-draft.mjs';

test('every checked-in brief parses and names a unique frame', () => {
  const briefs = loadBriefs();
  assert.deepEqual(
    briefs.map(b => b.frame),
    [
      'billing-success',
      'claim',
      'homepage',
      'profile-analytics-card',
      'request-access',
    ]
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

test('a .tar.gz workspace is unpacked and its named .pen is the input', () => {
  // The canonical URL serves the workspace folder as a .tar.gz so fonts and
  // images resolve. Written raw as canonical.pen, pen failed every frame with
  // "Failed to open document" (run 42457207487).
  const src = mkdtempSync(join(tmpdir(), 'pen-src-'));
  mkdirSync(join(src, 'ws', 'fonts'), { recursive: true });
  writeFileSync(join(src, 'ws', 'other.pen'), '{"children":[]}');
  writeFileSync(join(src, 'ws', 'canonical.lib.pen'), '{"children":[1]}');
  const tgz = join(src, 'ws.tar.gz');
  execFileSync('tar', ['-czf', tgz, '-C', src, 'ws']);
  const work = mkdtempSync(join(tmpdir(), 'pen-work-'));
  const pen = writeCanonical(readFileSync(tgz), work, 'canonical.lib.pen');
  assert.equal(basename(pen), 'canonical.lib.pen');
  assert.equal(readFileSync(pen, 'utf8'), '{"children":[1]}');
});

test('a plain .pen is used as is, and anything else is named, not drafted', () => {
  const work = mkdtempSync(join(tmpdir(), 'pen-work-'));
  const pen = writeCanonical(Buffer.from(' {"children":[]}'), work, 'x.pen');
  assert.equal(readFileSync(pen, 'utf8'), ' {"children":[]}');
  assert.throws(
    () => writeCanonical(Buffer.from('<html>expired</html>'), work, 'x.pen'),
    /neither a \.pen file nor a \.tar\.gz/
  );
});

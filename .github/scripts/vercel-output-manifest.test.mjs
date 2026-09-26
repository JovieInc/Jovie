import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildManifest,
  fitsUstar,
  formatReport,
  main,
  nameFlags,
  oversizedSegments,
  SCHEMA,
  summaryLine,
} from './vercel-output-manifest.mjs';

const SCRIPT = fileURLToPath(
  new URL('./vercel-output-manifest.mjs', import.meta.url)
);

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes = 'x') => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  const link = (name, target) => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);
    return path;
  };
  return { root, put, link };
}

const LONG_DIR = `.vercel/output/static/${'d'.repeat(120)}`;

function richFixture(t) {
  const f = fixture(t);
  f.put('.vercel/output/config.json', '{"version":3}');
  f.put('.vercel/output/static/big.bin', Buffer.alloc(4096));
  f.put('.vercel/output/static/café.txt', 'accent');
  f.put('.vercel/output/static/Readme.md', 'a');
  f.put('.vercel/output/static/readme.md', 'b');
  f.put('.vercel/output/static/what?.txt', 'q');
  f.put(`${LONG_DIR}/${'n'.repeat(140)}.js`, 'long');
  mkdirSync(resolve(f.root, '.vercel/output/static/empty'), {
    recursive: true,
  });
  const original = f.put('.vercel/output/static/original.js', 'hard');
  linkSync(original, resolve(f.root, '.vercel/output/static/hardlink.js'));
  f.link('.vercel/output/static/inside.js', 'original.js');
  f.link(
    '.vercel/output/static/escape.js',
    '../../../apps/web/public/escape.js'
  );
  f.link('.vercel/output/static/absolute.js', '/etc/hostname');
  f.link('.vercel/output/static/dangling.js', 'nope.js');
  f.link('.vercel/output/static/dirlink', 'empty');
  f.put('apps/web/public/escape.js', 'outside output');
  f.put('.vercel/output/functions/index.func/index.js', 'fn');
  f.put('node_modules/pkg/index.js', 'traced bytes');
  f.link('node_modules/pkg/linked.js', 'index.js');
  f.put(
    '.vercel/output/functions/index.func/.vc-config.json',
    JSON.stringify({
      filePathMap: {
        'node_modules/pkg/index.js': 'node_modules/pkg/index.js',
        'node_modules/pkg/linked.js': 'node_modules/pkg/linked.js',
        'index.js': '.vercel/output/functions/index.func/index.js',
        'missing.js': 'node_modules/pkg/missing.js',
        'escape.js': '../outside.js',
      },
    })
  );
  f.put(
    '.vercel/output/functions/other.func/.vc-config.json',
    JSON.stringify({
      filePathMap: { 'node_modules/pkg/index.js': 'node_modules/pkg/index.js' },
    })
  );
  f.put('.vercel/output/functions/broken.func/.vc-config.json', '{not json');
  return f;
}

test('manifest records the upload shape without following symlinks', t => {
  const f = richFixture(t);
  const manifest = buildManifest({ root: f.root });
  assert.equal(manifest.schema, SCHEMA);
  assert.equal(manifest.exists, true);
  assert.equal(manifest.outputDirType, 'directory');
  const out = manifest.output;

  assert.equal(out.totals.symlinks, 5);
  assert.equal(out.totals.emptyDirectories, 1, 'dirlink is not walked into');
  assert.equal(
    out.totals.entries,
    out.totals.files +
      out.totals.directories +
      out.totals.symlinks +
      out.totals.special
  );
  const links = Object.fromEntries(
    out.symlinks.entries.map(link => [link.path.split('/').pop(), link])
  );
  assert.deepEqual(
    { ...links['escape.js'], path: undefined },
    {
      path: undefined,
      target: '../../../apps/web/public/escape.js',
      targetType: 'file',
      absolute: false,
      escapesOutput: true,
      escapesRoot: false,
      dangling: false,
    }
  );
  assert.equal(links['absolute.js'].absolute, true);
  assert.equal(links['absolute.js'].escapesRoot, true);
  assert.equal(links['dangling.js'].dangling, true);
  assert.equal(links['inside.js'].escapesOutput, false);
  assert.equal(links.dirlink.targetType, 'directory');
  assert.equal(out.symlinks.escapesOutput, 2);
  assert.equal(out.symlinks.dangling, 1);

  assert.equal(out.largestFiles[0].path, '.vercel/output/static/big.bin');
  assert.equal(out.largestFiles[0].size, 4096);
  assert.ok(out.largestFiles.length <= 20);
  assert.ok(out.totals.totalBytes >= 4096);

  assert.match(out.longestPath.path, /n{140}\.js$/);
  assert.ok(out.longestPath.pathBytes > 256);
  assert.equal(out.longestPaths.length, 10);
  assert.ok(out.paths.ustarOverflow >= 1);
  assert.ok(out.paths.over100Bytes >= out.paths.ustarOverflow);

  const names = Object.fromEntries(
    out.unusualNames.entries.map(item => [
      item.path.split('/').pop(),
      item.flags,
    ])
  );
  assert.deepEqual(names['café.txt'], ['non-ascii']);
  assert.deepEqual(names['what?.txt'], ['reserved']);
  assert.deepEqual(out.caseCollisions.entries, [
    ['.vercel/output/static/Readme.md', '.vercel/output/static/readme.md'],
  ]);
  assert.deepEqual(out.hardlinks.entries, [
    {
      nlink: 2,
      paths: [
        '.vercel/output/static/hardlink.js',
        '.vercel/output/static/original.js',
      ],
    },
  ]);
  assert.deepEqual(out.errors, [
    {
      path: '.vercel/output/functions/broken.func/.vc-config.json',
      code: 'VC_CONFIG_PARSE',
    },
  ]);

  const fpm = manifest.filePathMap;
  assert.equal(fpm.configs, 3);
  assert.equal(fpm.references, 6);
  assert.equal(fpm.uniqueTargets, 5);
  assert.equal(fpm.targetsInsideOutput, 1);
  assert.deepEqual(fpm.targetsOutsideRoot, ['../outside.js']);
  assert.equal(fpm.totals.files, 1);
  assert.equal(fpm.totals.symlinks, 1);
  assert.equal(fpm.symlinks.toFiles, 1);
  assert.deepEqual(fpm.errors, [
    { path: 'node_modules/pkg/missing.js', code: 'ENOENT' },
  ]);
});

test('segment over 255 bytes, control characters and special modes are flagged', t => {
  const f = fixture(t);
  f.put('.vercel/output/config.json', '{}');
  const wide = '界'.repeat(84); // 252 + '.js' = 255 bytes: at the limit, not over it
  f.put(`.vercel/output/static/${wide}.js`, 'w');
  f.put('.vercel/output/static/tab\tname.js', 't');
  const setuid = f.put('.vercel/output/static/setuid.sh', '#!/bin/sh\n');
  chmodSync(setuid, 0o4755);
  const locked = f.put('.vercel/output/static/locked.txt', 'l');
  chmodSync(locked, 0o000);
  const manifest = buildManifest({ root: f.root });
  const out = manifest.output;
  assert.deepEqual(out.longSegments, []);
  // The filesystem refuses names over 255 bytes, so check the pure helper.
  assert.deepEqual(oversizedSegments(`static/${'界'.repeat(86)}/ok`), [258]);
  assert.deepEqual(oversizedSegments(`static/${wide}.js`), []);
  assert.deepEqual(nameFlags('a/trailing./b '), ['trailing-dot-or-space']);
  const flags = Object.fromEntries(
    out.unusualNames.entries.map(item => [
      item.path.split('/').pop(),
      item.flags,
    ])
  );
  assert.deepEqual(flags[`${wide}.js`], ['non-ascii']);
  assert.deepEqual(flags['tab\tname.js'], ['control']);
  const modes = Object.fromEntries(
    out.unusualModes.entries.map(item => [item.path.split('/').pop(), item])
  );
  assert.deepEqual(modes['setuid.sh'].reasons, ['setuid']);
  assert.equal(modes['setuid.sh'].mode, '04755');
  assert.deepEqual(modes['locked.txt'].reasons, ['owner-unreadable']);

  const report = formatReport(manifest);
  assert.ok(
    report.includes('"tab\\tname.js"') || report.includes('tab\\tname.js')
  );
  for (const line of report.split('\n'))
    assert.match(line, /^vercel-output-manifest\| /);
});

test('fifo entries are recorded as special files when mkfifo exists', t => {
  const f = fixture(t);
  f.put('.vercel/output/config.json', '{}');
  const fifo = resolve(f.root, '.vercel/output/static/pipe');
  mkdirSync(dirname(fifo), { recursive: true });
  const made = spawnSync('mkfifo', [fifo]);
  if (made.status !== 0) {
    t.skip('mkfifo unavailable');
    return;
  }
  const out = buildManifest({ root: f.root }).output;
  assert.equal(out.totals.special, 1);
  assert.deepEqual(
    out.unusualModes.entries.find(item => item.path.endsWith('/pipe')).reasons,
    ['fifo']
  );
});

test('missing output directory yields a minimal manifest and summary', t => {
  const f = fixture(t);
  const manifest = buildManifest({ root: f.root });
  assert.equal(manifest.exists, false);
  assert.equal(
    summaryLine(manifest),
    'Vercel output manifest: .vercel/output missing'
  );
  assert.equal(
    formatReport(manifest),
    'vercel-output-manifest| .vercel/output missing'
  );
});

test('output root that is a symlink is recorded but not walked', t => {
  const f = fixture(t);
  f.put('real/config.json', '{}');
  mkdirSync(resolve(f.root, '.vercel'));
  f.link('.vercel/output', '../real');
  const manifest = buildManifest({ root: f.root });
  assert.equal(manifest.outputDirType, 'symlink');
  assert.equal(manifest.output.totals.entries, 0);
});

test('ustar fit follows the 100-byte name / 155-byte prefix split', () => {
  assert.equal(fitsUstar('a'.repeat(100)), true);
  assert.equal(fitsUstar(`${'p'.repeat(150)}/${'n'.repeat(100)}`), true);
  assert.equal(fitsUstar(`${'p'.repeat(150)}/${'n'.repeat(101)}`), false);
  assert.equal(fitsUstar('a'.repeat(101)), false);
  assert.equal(fitsUstar('x'.repeat(300)), false);
});

test('main writes JSON, prints a report, and --summary reads it back', t => {
  const f = richFixture(t);
  const json = resolve(f.root, 'manifest.json');
  const lines = [];
  assert.equal(
    main(['--root', f.root, '--json', json], { log: line => lines.push(line) }),
    0
  );
  const written = JSON.parse(readFileSync(json, 'utf8'));
  assert.equal(written.output.totals.symlinks, 5);
  const summary = lines.at(-1);
  assert.match(
    summary,
    /^Vercel output manifest: entries=\d+ files=\d+ dirs=\d+ symlinks=5 escaping=2 absolute=1 /
  );
  assert.match(
    summary,
    /tracedUnique=5 tracedFiles=1 tracedSymlinks=1 tracedBytes=\d+ tracedMissing=1 /
  );
  const again = [];
  main(['--summary', json], { log: line => again.push(line) });
  assert.deepEqual(again, [summary]);
  assert.throws(() => main(['--json']), /--json requires a value/);
  assert.throws(
    () => main(['--bogus'], { cwd: f.root, log: () => {} }),
    /Unknown arguments/
  );
});

test('report never contains file contents', t => {
  const f = fixture(t);
  f.put('.vercel/output/static/secret.txt', 'sk_live_do_not_print');
  const output = execFileSync(process.execPath, [SCRIPT], {
    cwd: f.root,
    encoding: 'utf8',
  });
  assert.match(output, /secret\.txt/);
  assert.doesNotMatch(output, /sk_live_do_not_print/);
});

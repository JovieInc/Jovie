import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
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
  bundledIgnoreVersion,
  pruneIgnoredFilePathMap,
} from './prune-ignored-filepathmap.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-filepathmap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes) => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  put(
    '.vercel/output/functions/fn.func/.vc-config.json',
    `${JSON.stringify({
      runtime: 'nodejs22.x',
      handler: 'index.js',
      filePathMap: {
        changelog: 'CHANGELOG.md',
        registry: 'docs/FEATURE_REGISTRY.md',
        helper: 'scripts/symphony/symphony-codex-account-control.py',
        eve: 'apps/eve-pilot/identities/jovie/instructions.md',
        quarantine: 'apps/web/tests/quarantine.json',
        content: 'apps/web/content/runtime-data.json',
        topic: 'apps/web/lib/chat/knowledge/topics/foo.md',
        sharp: 'apps/web/scripts/sync-standalone-assets.mjs',
        docsConfig: 'apps/docs/next.config.mjs',
        robots: 'apps/web/public/robots.txt',
        traced: 'node_modules/next/dist/server/lib.js',
        nextOut: 'apps/web/.next/server/app/page.js',
        docs: 'docs/white-space.md',
        testFile: 'apps/web/lib/foo.test.ts',
        otherTests: 'apps/web/tests/other.json',
        script: 'scripts/other.mjs',
        outside: '../outside.md',
        escaped: 'foo/../../escaped.txt',
        absolute: '/etc/passwd',
      },
    })}\n`
  );
  return { root, put };
}

test('uses the ignore package bundled in the installed Vercel CLI', () => {
  assert.equal(bundledIgnoreVersion(), '4.0.6');
});

test('drops refs the prebuilt CLI will not upload and keeps allowlisted runtime files', t => {
  const f = fixture(t);
  writeFileSync(
    resolve(f.root, '.vercelignore'),
    readFileSync(resolve(repo, '.vercelignore'))
  );
  const configPath = resolve(
    f.root,
    '.vercel/output/functions/fn.func/.vc-config.json'
  );
  const before = readFileSync(configPath, 'utf8');
  const { removed } = pruneIgnoredFilePathMap(f.root);
  const map = JSON.parse(readFileSync(configPath, 'utf8')).filePathMap;
  assert.deepEqual(Object.keys(map).sort(), [
    'absolute',
    'changelog',
    'content',
    'docsConfig',
    'eve',
    'helper',
    'nextOut',
    'quarantine',
    'registry',
    'robots',
    'sharp',
    'topic',
    'traced',
  ]);
  assert.equal(map.absolute, '/etc/passwd');
  assert.deepEqual([...new Set(removed)].sort(), [
    '../escaped.txt',
    '../outside.md',
    'apps/web/lib/foo.test.ts',
    'apps/web/tests/other.json',
    'docs/white-space.md',
    'scripts/other.mjs',
  ]);
  assert.equal(pruneIgnoredFilePathMap(f.root).removed.length, 0);
  assert.equal(readFileSync(configPath, 'utf8').includes('"runtime"'), true);
  assert.notEqual(readFileSync(configPath, 'utf8'), before);
});

test('keeps an ignored path that is already a file in the prebuilt output', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, '.vercelignore'), '*\n');
  const traced = '.vercel/output/functions/fn.func/traced.js';
  f.put(traced, 'uploaded bytes');
  const configPath = f.put(
    '.vercel/output/functions/fn.func/.vc-config.json',
    JSON.stringify({
      filePathMap: {
        inside: traced,
        missing: 'docs/missing.md',
        dependency: 'node_modules/next/package.json',
      },
    })
  );
  pruneIgnoredFilePathMap(f.root);
  const map = JSON.parse(readFileSync(configPath, 'utf8')).filePathMap;
  assert.deepEqual(map, {
    inside: traced,
    dependency: 'node_modules/next/package.json',
  });
});

test('with no ignore file, only outside-root refs are removed', t => {
  const f = fixture(t);
  const configPath = resolve(
    f.root,
    '.vercel/output/functions/fn.func/.vc-config.json'
  );
  const { removed } = pruneIgnoredFilePathMap(f.root);
  const map = JSON.parse(readFileSync(configPath, 'utf8')).filePathMap;
  assert.equal(map.docs, 'docs/white-space.md');
  assert.deepEqual([...new Set(removed)].sort(), [
    '../escaped.txt',
    '../outside.md',
  ]);
});

test('uses .nowignore when .vercelignore is absent and rejects both', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, '.nowignore'), '*.md\n!CHANGELOG.md\n');
  const configPath = f.put(
    '.vercel/output/functions/other.func/.vc-config.json',
    JSON.stringify({
      filePathMap: { keep: 'CHANGELOG.md', drop: 'docs/a.md' },
    })
  );
  pruneIgnoredFilePathMap(f.root);
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')).filePathMap, {
    keep: 'CHANGELOG.md',
  });
  writeFileSync(resolve(f.root, '.vercelignore'), '*.md\n');
  assert.throws(
    () => pruneIgnoredFilePathMap(f.root),
    /CONFLICTING_IGNORE_FILES/
  );
});

test('leaves configs without filePathMap unchanged and rejects unsafe output', t => {
  const f = fixture(t);
  const plain = f.put(
    '.vercel/output/functions/plain.func/.vc-config.json',
    '{"runtime":"nodejs22.x"}\n'
  );
  f.put(
    '.vercel/output/functions/empty.func/.vc-config.json',
    '{"filePathMap":{}}\n'
  );
  assert.equal(pruneIgnoredFilePathMap(f.root).configCount >= 2, true);
  assert.equal(readFileSync(plain, 'utf8'), '{"runtime":"nodejs22.x"}\n');
  rmSync(resolve(f.root, '.vercel/output'), { recursive: true });
  assert.throws(() => pruneIgnoredFilePathMap(f.root), /real directory/);
});

test('rejects a non-string filePathMap value and a symlinked config', t => {
  const f = fixture(t);
  const bad = resolve(
    f.root,
    '.vercel/output/functions/fn.func/.vc-config.json'
  );
  writeFileSync(bad, JSON.stringify({ filePathMap: { n: 1 } }));
  assert.throws(() => pruneIgnoredFilePathMap(f.root), /must be a string/);
  writeFileSync(bad, JSON.stringify({ filePathMap: {} }));
  const link = resolve(f.root, '.vercel/output/functions/linked.func');
  mkdirSync(link, { recursive: true });
  symlinkSync(bad, resolve(link, '.vc-config.json'));
  assert.throws(() => pruneIgnoredFilePathMap(f.root), /symlinked/);
});

test('does not follow a symlinked output directory', t => {
  const f = fixture(t);
  const elsewhere = resolve(f.root, 'elsewhere');
  mkdirSync(elsewhere, { recursive: true });
  const hidden = resolve(elsewhere, '.vc-config.json');
  writeFileSync(
    hidden,
    JSON.stringify({ filePathMap: { drop: 'docs/white-space.md' } })
  );
  symlinkSync(elsewhere, resolve(f.root, '.vercel/output/linked'));
  writeFileSync(resolve(f.root, '.vercelignore'), '*.md\n');
  pruneIgnoredFilePathMap(f.root);
  assert.equal(
    JSON.parse(readFileSync(hidden, 'utf8')).filePathMap.drop,
    'docs/white-space.md'
  );
  assert.equal(
    lstatSync(resolve(f.root, '.vercel/output/linked')).isSymbolicLink(),
    true
  );
});

test('CLI prints the pruned path sample', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, '.vercelignore'), '*.md\n');
  const stdout = execFileSync(
    process.execPath,
    [resolve(repo, '.github/scripts/prune-ignored-filepathmap.mjs')],
    { cwd: f.root, encoding: 'utf8' }
  );
  assert.match(stdout, /Pruned \d+ prebuilt filePathMap entries/);
  assert.match(stdout, /docs\/white-space\.md/);
});

test('release workflow prunes after static materialization on both targets', () => {
  const workflow = readFileSync(
    resolve(repo, '.github/workflows/production-release.yml'),
    'utf8'
  );
  const invocation = 'node .github/scripts/prune-ignored-filepathmap.mjs';
  assert.equal(workflow.split(invocation).length - 1, 2);
  for (const [build, after] of [
    ['vercel build "${scope_args[@]}"', 'Hash fixed staging build subject'],
    ['vercel build --prod', 'production-input-provenance.mjs artifact'],
  ]) {
    const start = workflow.indexOf(build);
    const materialize = workflow.indexOf(
      'node .github/scripts/materialize-vercel-static.mjs',
      start
    );
    const prune = workflow.indexOf(invocation, materialize);
    assert.ok(
      start >= 0 &&
        materialize > start &&
        prune > materialize &&
        workflow.indexOf(after, start) > prune
    );
  }
  const staging = workflow.indexOf('staging_build()');
  const robots = workflow.indexOf('apps/web/public/robots.txt', staging);
  const prune = workflow.indexOf(invocation, robots);
  assert.ok(robots > staging && prune > robots);
});

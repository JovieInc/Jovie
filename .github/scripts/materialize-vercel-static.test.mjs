import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { materializeStatic } from './materialize-vercel-static.mjs';
import { artifactSnapshot } from './production-input-provenance.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-static-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes = 'asset bytes') => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  put('.vercel/output/config.json', '{"version":3}');
  mkdirSync(resolve(root, '.vercel/output/static'));
  const link = (name, target) => {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);
    return path;
  };
  return { root, put, link };
}

test('real canonical public exports survive Vercel relocation and bind exact image bytes', t => {
  const f = fixture(t);
  const names = execFileSync('git', ['ls-files', '-s', 'apps/web/public'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(line => line.startsWith('120000 '))
    .map(line => line.split('\t')[1]);
  assert.ok(names.length >= 6);
  for (const name of names) {
    const source = resolve(repo, name);
    f.put(join(dirname(name), readlinkSync(source)), readFileSync(source));
    f.link(name, readlinkSync(source));
    f.link(
      name.replace('apps/web/public', '.vercel/output/static'),
      readlinkSync(source)
    );
  }
  assert.throws(() => artifactSnapshot(f.root), /ENOENT/);
  assert.equal(materializeStatic(f.root), names.length);
  const receipt = artifactSnapshot(f.root);
  for (const name of names) {
    const outputName = name.replace('apps/web/public', '.vercel/output/static');
    assert.equal(
      lstatSync(resolve(f.root, outputName)).isSymbolicLink(),
      false
    );
    assert.equal(lstatSync(resolve(f.root, name)).isSymbolicLink(), true);
    assert.deepEqual(
      readFileSync(resolve(f.root, outputName)),
      readFileSync(resolve(repo, name))
    );
    assert.equal(
      receipt.files.find(file => file.path === outputName).sha256,
      createHash('sha256')
        .update(readFileSync(resolve(repo, name)))
        .digest('hex')
    );
  }
  assert.equal(materializeStatic(f.root), 0);
  assert.deepEqual(artifactSnapshot(f.root), receipt);
});

for (const alteredLink of [false, true]) {
  test(`canonical export wins relocated namespace collision; altered link=${alteredLink}`, t => {
    const f = fixture(t);
    f.put('apps/web/screenshot-catalog/current/image.png', 'canonical image');
    f.link(
      'apps/web/public/images/image.png',
      '../../screenshot-catalog/current/image.png'
    );
    const decoy = f.put(
      '.vercel/output/screenshot-catalog/current/image.png',
      'unrelated artifact'
    );
    const output = f.link(
      '.vercel/output/static/images/image.png',
      alteredLink ? decoy : '../../screenshot-catalog/current/image.png'
    );
    if (alteredLink) {
      assert.throws(() => materializeStatic(f.root), /match public export/);
      assert.equal(lstatSync(output).isSymbolicLink(), true);
    } else {
      assert.equal(materializeStatic(f.root), 1);
      assert.equal(readFileSync(output, 'utf8'), 'canonical image');
    }
  });
}

test('materializes valid build links and preserves regular files; later drift changes provenance', t => {
  const f = fixture(t);
  const source = f.put('apps/web/.next/static/chunk.js', 'built chunk');
  f.put('.vercel/output/static/plain.txt', 'plain');
  const output = f.link('.vercel/output/static/chunk.js', source);
  assert.equal(materializeStatic(f.root), 1);
  assert.equal(readFileSync(output, 'utf8'), 'built chunk');
  const before = artifactSnapshot(f.root);
  writeFileSync(source, 'source drift');
  assert.deepEqual(artifactSnapshot(f.root), before);
  writeFileSync(output, 'artifact drift');
  assert.notEqual(artifactSnapshot(f.root).digest, before.digest);
});

for (const kind of [
  'escape',
  'directory',
  'cycle',
  'missing',
  'mismatch',
  'broken-source',
]) {
  test(`refuses ${kind} before materializing any valid link`, t => {
    const f = fixture(t);
    const good = f.link(
      '.vercel/output/static/a-good',
      f.put('apps/web/.next/asset.txt')
    );
    let target;
    if (kind === 'escape') target = tmpdir();
    if (kind === 'directory') target = resolve(f.root, 'apps/web/.next');
    if (kind === 'cycle') target = 'z-bad';
    if (kind === 'missing') target = 'absent';
    if (kind === 'mismatch') {
      f.link(
        'apps/web/public/z-bad',
        f.put('apps/web/screenshot-catalog/current/image.png')
      );
      target = f.put('apps/web/.next/other.png');
    }
    if (kind === 'broken-source') {
      f.link('apps/web/public/z-bad', '../../missing');
      target = '../../missing';
    }
    mkdirSync(resolve(f.root, 'apps'), { recursive: true });
    f.link('.vercel/output/static/z-bad', target);
    assert.throws(() => materializeStatic(f.root));
    assert.equal(lstatSync(good).isSymbolicLink(), true);
  });
}

for (const [name, canonical] of [
  ['.vercel/.env.production.local', false],
  ['config/private.json', false],
  ['.vercel/.env.production.local', true],
]) {
  test(`refuses non-public target ${name}, canonical export=${canonical}`, t => {
    const f = fixture(t);
    const good = f.link(
      '.vercel/output/static/a-good',
      f.put('apps/web/.next/chunk.js')
    );
    const secret = f.put(name, 'SENTINEL_PRIVATE_VALUE');
    const bad = f.link('.vercel/output/static/z-secret', secret);
    if (canonical) f.link('apps/web/public/z-secret', secret);
    assert.throws(() => materializeStatic(f.root), /approved asset root/);
    assert.equal(lstatSync(good).isSymbolicLink(), true);
    assert.equal(lstatSync(bad).isSymbolicLink(), true);
  });
}

test('refuses an interrupted-copy orphan inside deployable output before any write', t => {
  const f = fixture(t);
  const good = f.link(
    '.vercel/output/static/a-good',
    f.put('apps/web/.next/chunk.js')
  );
  f.put(
    '.vercel/output/static/nested/.jovie-materialize-orphan',
    'PARTIAL_COPY'
  );
  assert.throws(() => materializeStatic(f.root), /temporary materializer/);
  assert.equal(lstatSync(good).isSymbolicLink(), true);
});

test('interrupted staging copy outside output cannot enter the deployment snapshot', t => {
  const f = fixture(t);
  f.put('.vercel/.jovie-materialize-orphan', 'PARTIAL_COPY');
  f.link(
    '.vercel/output/static/chunk.js',
    f.put('apps/web/.next/chunk.js', 'complete bytes')
  );
  assert.equal(materializeStatic(f.root), 1);
  assert.equal(materializeStatic(f.root), 0);
  assert.ok(
    !JSON.stringify(artifactSnapshot(f.root)).includes('jovie-materialize')
  );
  assert.equal(
    readFileSync(resolve(f.root, '.vercel/output/static/chunk.js'), 'utf8'),
    'complete bytes'
  );
});

test('refuses a symlinked static root without modifying its target', t => {
  const f = fixture(t);
  rmSync(resolve(f.root, '.vercel/output/static'), { recursive: true });
  mkdirSync(resolve(f.root, 'elsewhere'));
  f.link('.vercel/output/static', resolve(f.root, 'elsewhere'));
  assert.throws(() => materializeStatic(f.root), /real directory/);
});

test('CLI materializes the build before artifact hashing in both release targets', t => {
  const f = fixture(t);
  f.link('.vercel/output/static/chunk.js', f.put('apps/web/.next/built.js'));
  const stdout = execFileSync(
    process.execPath,
    [resolve(repo, '.github/scripts/materialize-vercel-static.mjs')],
    { cwd: f.root, encoding: 'utf8' }
  );
  assert.match(stdout, /Materialized 1/);
  assert.equal(
    lstatSync(resolve(f.root, '.vercel/output/static/chunk.js')).isFile(),
    true
  );
  const workflow = readFileSync(
    resolve(repo, '.github/workflows/production-release.yml'),
    'utf8'
  );
  const invocation = 'node .github/scripts/materialize-vercel-static.mjs';
  assert.equal(workflow.split(invocation).length - 1, 2);
  for (const [build, hash] of [
    ['vercel build "${scope_args[@]}"', 'Hash fixed staging build subject'],
    ['vercel build --prod', 'production-input-provenance.mjs artifact'],
  ]) {
    const start = workflow.indexOf(build);
    const materialize = workflow.indexOf(invocation, start);
    assert.ok(
      start >= 0 &&
        materialize > start &&
        workflow.indexOf(hash, start) > materialize
    );
  }
});

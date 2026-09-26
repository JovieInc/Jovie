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
import {
  dereferenceFunctionFileLinks,
  materializeStatic,
} from './materialize-vercel-static.mjs';
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
      f.put('apps/web/.next/static/asset.txt')
    );
    let target;
    if (kind === 'escape') target = tmpdir();
    if (kind === 'directory') target = resolve(f.root, 'apps/web/.next/static');
    if (kind === 'cycle') target = 'z-bad';
    if (kind === 'missing') target = 'absent';
    if (kind === 'mismatch') {
      f.link(
        'apps/web/public/z-bad',
        f.put('apps/web/screenshot-catalog/current/image.png')
      );
      target = f.put('apps/web/.next/static/other.png');
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
  ['apps/web/.next/server/private.js', false],
  ['.vercel/.env.production.local', true],
]) {
  test(`refuses non-public target ${name}, canonical export=${canonical}`, t => {
    const f = fixture(t);
    const good = f.link(
      '.vercel/output/static/a-good',
      f.put('apps/web/.next/static/chunk.js')
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
    f.put('apps/web/.next/static/chunk.js')
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
    f.put('apps/web/.next/static/chunk.js', 'complete bytes')
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
  f.link(
    '.vercel/output/static/chunk.js',
    f.put('apps/web/.next/static/built.js')
  );
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

function withFunctionConfig(f, name, filePathMap) {
  const path = f.put(
    `.vercel/output/functions/${name}.func/.vc-config.json`,
    JSON.stringify({ runtime: 'nodejs22.x', filePathMap })
  );
  return {
    path,
    read: () => JSON.parse(readFileSync(path, 'utf8')).filePathMap,
  };
}

test('dereferences file-symlink trace targets that break Vercel tgz extraction', t => {
  const f = fixture(t);
  // Real shape from JOV-6576: outputFileTracingIncludes pulls the public
  // screenshot export links into the admin screenshot functions.
  f.put(
    'apps/web/screenshot-catalog/current/public-profile-desktop.png',
    'png'
  );
  const exportLink = 'apps/web/public/product-screenshots/profile-desktop.png';
  f.link(
    exportLink,
    '../../screenshot-catalog/current/public-profile-desktop.png'
  );
  f.put('node_modules/.pnpm/next@16/node_modules/next/package.json', '{}');
  f.link(
    'apps/web/node_modules/next',
    '../../../node_modules/.pnpm/next@16/node_modules/next'
  );
  f.put('CHANGELOG.md', '# log');
  const admin = withFunctionConfig(f, 'admin/screenshots', {
    [exportLink]: exportLink,
    'apps/web/node_modules/next': 'apps/web/node_modules/next',
    'CHANGELOG.md': 'CHANGELOG.md',
  });
  // Next writes aliases such as page.rsc.func as links to the real function.
  f.link(
    '.vercel/output/functions/admin/screenshots.rsc.func',
    'screenshots.func'
  );

  assert.equal(dereferenceFunctionFileLinks(f.root), 1);
  assert.deepEqual(admin.read(), {
    [exportLink]:
      'apps/web/screenshot-catalog/current/public-profile-desktop.png',
    'apps/web/node_modules/next': 'apps/web/node_modules/next',
    'CHANGELOG.md': 'CHANGELOG.md',
  });
  // The source export link is untouched; only the upload map changes.
  assert.equal(lstatSync(resolve(f.root, exportLink)).isSymbolicLink(), true);
  assert.equal(dereferenceFunctionFileLinks(f.root), 0);
});

test('dereferences every checked-in public export link a trace can include', t => {
  const f = fixture(t);
  const names = execFileSync('git', ['ls-files', '-s', 'apps/web/public'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(line => line.startsWith('120000 '))
    .map(line => line.split('\t')[1]);
  assert.ok(names.length >= 6);
  const map = {};
  for (const name of names) {
    const source = resolve(repo, name);
    f.put(join(dirname(name), readlinkSync(source)), readFileSync(source));
    f.link(name, readlinkSync(source));
    map[name] = name;
  }
  const config = withFunctionConfig(f, 'api/admin/screenshots', map);
  assert.equal(dereferenceFunctionFileLinks(f.root), names.length);
  for (const [key, value] of Object.entries(config.read())) {
    assert.equal(lstatSync(resolve(f.root, value)).isFile(), true, key);
    assert.deepEqual(
      readFileSync(resolve(f.root, value)),
      readFileSync(resolve(repo, key))
    );
  }
});

for (const kind of ['dangling', 'escape', 'outside-root']) {
  test(`refuses ${kind} function trace link before rewriting any config`, t => {
    const f = fixture(t);
    f.put('real.txt', 'bytes');
    f.link('good-link.txt', 'real.txt');
    const good = withFunctionConfig(f, 'a-good', {
      'good-link.txt': 'good-link.txt',
    });
    const before = readFileSync(good.path, 'utf8');
    if (kind === 'dangling') {
      f.link('bad-link.txt', 'absent.txt');
      withFunctionConfig(f, 'z-bad', { 'bad-link.txt': 'bad-link.txt' });
    } else if (kind === 'escape') {
      f.link('bad-link.txt', resolve(tmpdir()));
      withFunctionConfig(f, 'z-bad', { 'bad-link.txt': 'bad-link.txt' });
    } else {
      withFunctionConfig(f, 'z-bad', { outside: '../outside.txt' });
    }
    assert.throws(() => dereferenceFunctionFileLinks(f.root));
    assert.equal(readFileSync(good.path, 'utf8'), before);
  });
}

test('function dereference is a no-op without prebuilt functions', t => {
  const f = fixture(t);
  assert.equal(dereferenceFunctionFileLinks(f.root), 0);
});

test('CLI reports dereferenced function trace links', t => {
  const f = fixture(t);
  f.put('real.txt', 'bytes');
  f.link('link.txt', 'real.txt');
  const config = withFunctionConfig(f, 'index', { 'link.txt': 'link.txt' });
  const stdout = execFileSync(
    process.execPath,
    [resolve(repo, '.github/scripts/materialize-vercel-static.mjs')],
    { cwd: f.root, encoding: 'utf8' }
  );
  assert.match(stdout, /Dereferenced 1 function trace file symlinks/);
  assert.deepEqual(config.read(), { 'link.txt': 'real.txt' });
});

test('re-points files traced through a hoisted pnpm directory link at their real path', t => {
  const f = fixture(t);
  const store = 'node_modules/.pnpm/import-in-the-middle@3.5.1/node_modules/import-in-the-middle';
  f.put(`${store}/index.js`, 'hook');
  f.link('node_modules/.pnpm/node_modules/import-in-the-middle', '../import-in-the-middle@3.5.1/node_modules/import-in-the-middle');
  f.link('apps/web/node_modules/next', '../../../node_modules/.pnpm/import-in-the-middle@3.5.1');
  const hoisted = 'node_modules/.pnpm/node_modules/import-in-the-middle/index.js';
  const config = resolve(f.root, '.vercel/output/functions/api.func/.vc-config.json');
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ filePathMap: {
    [hoisted]: hoisted,
    'apps/web/node_modules/next': 'apps/web/node_modules/next',
  } }));
  assert.equal(dereferenceFunctionFileLinks(f.root), 1);
  const map = JSON.parse(readFileSync(config, 'utf8')).filePathMap;
  // Same destination key, real source file; the directory link itself is untouched.
  assert.equal(map[hoisted], `${store}/index.js`);
  assert.equal(map['apps/web/node_modules/next'], 'apps/web/node_modules/next');
  assert.equal(dereferenceFunctionFileLinks(f.root), 0);
});

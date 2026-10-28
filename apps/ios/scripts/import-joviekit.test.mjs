import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkPackage,
  downloadSource,
  importPackage,
  runImport,
  validateManifest,
} from './import-joviekit.mjs';

const source = new Map([
  ['Package.swift', Buffer.from('// swift-tools-version: 6.0\n')],
  ['LICENSE', Buffer.from('Company source license\n')],
  [
    'Sources/JovieKit/AppReviewPolicy.swift',
    Buffer.from('enum AppReview {}\n'),
  ],
]);
const pin = {
  schemaVersion: 1,
  repository: 'JovieInc/Jovie',
  revision: 'a'.repeat(40),
  packagePath: 'apps/ios/Packages/JovieKit',
  files: [...source].map(([path, bytes]) => ({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })),
};
const fetcher = async url => {
  const relative = url.replace(
    `https://raw.githubusercontent.com/JovieInc/Jovie/${pin.revision}/`,
    ''
  );
  const path = relative.replace(`${pin.packagePath}/`, '');
  assert.ok(source.has(path), `unexpected remote source ${url}`);
  return new Response(source.get(path));
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'joviekit-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return join(root, 'Vendor', 'JovieKit');
}

test('transport preserves bytes, bounds subprocess work and rejects non-HTTPS', async () => {
  const bytes = Buffer.from([0, 255, 13, 10]);
  const response = await downloadSource(
    'https://raw.githubusercontent.com/example',
    async (command, args, options) => {
      assert.equal(command, 'curl');
      assert.ok(args.includes('--fail'));
      assert.equal(args[args.indexOf('--proto') + 1], '=https');
      assert.equal(args[args.indexOf('--max-time') + 1], '20');
      assert.equal(options.timeout, 21_000);
      assert.equal(options.maxBuffer, 1_000_001);
      assert.ok(!args.includes('--location'));
      return { stdout: bytes };
    }
  );
  assert.deepEqual(await response.arrayBuffer(), bytes);
  await assert.rejects(
    downloadSource('file:///nonexistent-joviekit-fixture'),
    /Protocol.*disabled|not supported/i
  );
});

test('command validates arguments and supports import plus offline check', async t => {
  const destination = await fixture(t);
  const manifestPath = join(dirname(destination), '..', 'pin.json');
  await writeFile(manifestPath, JSON.stringify(pin));
  for (const args of [
    [],
    ['update', manifestPath, destination],
    ['check'],
    ['check', manifestPath],
    ['check', manifestPath, destination, 'extra'],
  ]) {
    await assert.rejects(runImport(args), /Usage:/);
  }
  assert.match(
    await runImport(['import', manifestPath, destination], fetcher),
    /3 verified files/
  );
  assert.match(
    await runImport(['check', manifestPath, destination], () =>
      assert.fail('offline check must not fetch')
    ),
    /check:/
  );
});

test('imports immutable remote bytes and verifies offline after SwiftPM creates build state', async t => {
  const destination = await fixture(t);
  await importPackage(pin, destination, fetcher);
  assert.deepEqual(
    await readFile(join(destination, 'Package.swift')),
    source.get('Package.swift')
  );
  await mkdir(join(destination, '.build'));
  await writeFile(join(destination, '.build', 'output'), 'generated');
  await mkdir(join(destination, '.swiftpm'));
  await checkPackage(pin, destination);
});

test('rejects mutable, incomplete, duplicate, oversized and traversal manifests before fetch', async t => {
  const bad = [
    null,
    { ...pin, schemaVersion: 2 },
    { ...pin, repository: 'other/repo' },
    { ...pin, packagePath: '../Sources' },
    { ...pin, revision: 'main' },
    { ...pin, files: null },
    { ...pin, files: Array(65).fill(pin.files[0]) },
    { ...pin, files: [] },
    { ...pin, files: [...pin.files, pin.files[0]] },
  ];
  for (const path of [
    '../escape.swift',
    '/root.swift',
    'Sources//Escape.swift',
    '.jovie-source.json',
  ]) {
    bad.push({
      ...pin,
      files: [...pin.files, { path, sha256: 'a'.repeat(64) }],
    });
  }
  bad.push({ ...pin, files: [...pin.files, null] });
  bad.push({ ...pin, files: [{ path: 'LICENSE', sha256: 'wrong' }] });
  for (const manifest of bad) assert.throws(() => validateManifest(manifest));
  await assert.rejects(
    importPackage(bad[3], await fixture(t), () => assert.fail('must not fetch'))
  );
});

test('failed download or integrity check leaves destination absent', async t => {
  const destination = await fixture(t);
  for (const response of [
    new Response('missing', { status: 404 }),
    new Response('changed'),
    new Response(Buffer.alloc(1_000_001)),
  ]) {
    await assert.rejects(
      importPackage(pin, destination, async () => response.clone())
    );
    await assert.rejects(readFile(join(destination, 'Package.swift')), {
      code: 'ENOENT',
    });
  }
  await assert.rejects(
    importPackage(pin, destination, async () => {
      throw new Error('offline');
    }),
    /offline/
  );
});

test('never overwrites existing consumer edits or silently changes a source pin', async t => {
  const destination = await fixture(t);
  await importPackage(pin, destination, fetcher);
  await assert.rejects(
    importPackage(pin, destination, () => assert.fail('must not fetch')),
    /Destination exists/
  );
  await assert.rejects(
    checkPackage({ ...pin, revision: 'b'.repeat(40) }, destination),
    /receipt differs/
  );
  await writeFile(
    join(destination, 'Sources/JovieKit/AppReviewPolicy.swift'),
    'consumer fork'
  );
  await assert.rejects(checkPackage(pin, destination), /checksum mismatch/);
});

test('offline validation rejects added, missing or symlinked source', async t => {
  const destination = await fixture(t);
  await importPackage(pin, destination, fetcher);
  await writeFile(
    join(destination, 'Sources/JovieKit/Extra.swift'),
    'extension AppReview {}'
  );
  await assert.rejects(
    checkPackage(pin, destination),
    /unexpected source file/
  );
  await rm(join(destination, 'Sources/JovieKit/Extra.swift'));
  await rm(join(destination, 'Package.swift'));
  await assert.rejects(checkPackage(pin, destination), /Missing/);
  await symlink(
    join(destination, 'LICENSE'),
    join(destination, 'Package.swift')
  );
  await assert.rejects(
    checkPackage(pin, destination),
    /Unexpected source entry/
  );
});

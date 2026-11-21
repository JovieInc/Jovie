import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sigV4Authorization, storeConfig } from '../r2-store-client.mjs';
import {
  binaryPathFor,
  buildPointer,
  hydrate,
  isMovedBinary,
  keyOf,
  pointerPathFor,
  servedCatalogImages,
  uploadObject,
  validatePointer,
  verifyBytes,
  verifyRemote,
  writePointer,
} from '../screenshot-store.mjs';

const bytes = Buffer.from('png-bytes');
const pointer = () =>
  buildPointer({
    bytes,
    extension: '.png',
    viewport: '1440x900',
    capturedAt: '2026-10-29T00:00:00Z',
  });
const NOW = Date.parse('2026-10-30');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'screenshot-store-'));
  const binaryPath = 'apps/web/screenshot-catalog/current/a.png';
  writePointer(root, pointerPathFor(binaryPath), pointer());
  return { root, binaryPath };
}
const config = storeConfig({
  R2_ACCOUNT_ID: 'acct1234',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'SECRET',
});
const urlFor = p =>
  `https://acct1234.r2.cloudflarestorage.com/jovie-screenshots/${keyOf(p)}`;
/**
 * Fake private store: every request must carry a SigV4 Authorization header,
 * otherwise it is refused like R2 refuses an anonymous request.
 * @param {Record<string, Buffer>} map
 * @returns {typeof fetch}
 */
const respond =
  (map, { head = false } = {}) =>
  async (input, init = {}) => {
    const auth = init.headers?.authorization ?? '';
    if (
      !/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, /.test(
        auth
      )
    )
      return new Response(null, { status: 403 });
    const body = map[String(input)];
    if (body === undefined) return new Response(null, { status: 404 });
    return new Response(head ? null : new Uint8Array(body), {
      status: 200,
      headers: { 'content-length': String(body.length) },
    });
  };

test('pointers are content addressed and verify against bytes', () => {
  const p = pointer();
  assert.deepEqual(validatePointer(p, NOW), []);
  assert.deepEqual(verifyBytes(p, bytes), []);
  assert.deepEqual(verifyBytes(p, Buffer.from('other')), [
    'size mismatch',
    'sha256 mismatch',
  ]);
  assert.match(keyOf(p), /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/);
  assert.ok(
    validatePointer(
      { ...p, url: 'r2://jovie-screenshots/sha256/00/x.png' },
      NOW
    ).length
  );
  assert.ok(validatePointer({ ...p, capturedAt: '2999-01-01' }, NOW).length);
});

test('catalog pointers live beside, not inside, current/ and round-trip', () => {
  const binary = 'apps/web/screenshot-catalog/current/x.png';
  const pointerPath = 'apps/web/screenshot-catalog/pointers/x.png.pointer.json';
  assert.equal(pointerPathFor(binary), pointerPath);
  assert.equal(binaryPathFor(pointerPath), binary);
  assert.equal(
    pointerPathFor('docs/screenshots/a/b.jpg'),
    'docs/screenshots/a/b.jpg.pointer.json'
  );
  assert.equal(
    binaryPathFor('docs/screenshots/a/b.jpg.pointer.json'),
    'docs/screenshots/a/b.jpg'
  );
});

test('moved-binary ban covers images under the moved roots only', () => {
  assert.equal(
    isMovedBinary('apps/web/screenshot-catalog/current/x.png'),
    true
  );
  assert.equal(isMovedBinary('docs/screenshots/jov-1/a.JPG'), true);
  assert.equal(isMovedBinary('docs/screenshots/x/clip.mp4'), true);
  assert.equal(isMovedBinary('docs/screenshots/x/clip.webp'), true);
  assert.equal(
    isMovedBinary('docs/screenshots/gem-symphony-hud-430x90.png'),
    false
  );
  assert.equal(
    isMovedBinary('apps/web/screenshot-catalog/current/manifest.json'),
    false
  );
  assert.equal(
    isMovedBinary('apps/web/screenshot-catalog/pointers/x.png.pointer.json'),
    false
  );
  assert.equal(isMovedBinary('apps/web/public/hero.png'), false);
});

test('hydrate downloads, verifies sha256, and skips verified files', async () => {
  const { root, binaryPath } = fixture();
  try {
    const url = urlFor(pointer());
    const fetchImpl = respond({ [url]: bytes });
    const first = await hydrate({ root, fetchImpl, config });
    assert.deepEqual([first.downloaded, first.present], [1, 0]);
    assert.deepEqual(readFileSync(join(root, binaryPath)), bytes);
    const second = await hydrate({ root, fetchImpl: respond({}), config });
    assert.deepEqual([second.downloaded, second.present], [0, 1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hydrate rejects tampered bytes and never writes them', async () => {
  const { root, binaryPath } = fixture();
  try {
    const url = urlFor(pointer());
    await assert.rejects(
      hydrate({
        root,
        fetchImpl: respond({ [url]: Buffer.from('tampered!') }),
        config,
      }),
      /sha256 mismatch/
    );
    assert.throws(() => readFileSync(join(root, binaryPath)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hydrate replaces a stale on-disk file with the pointer bytes', async () => {
  const { root, binaryPath } = fixture();
  try {
    mkdirSync(join(root, 'apps/web/screenshot-catalog/current'), {
      recursive: true,
    });
    writeFileSync(join(root, binaryPath), 'stale');
    const url = urlFor(pointer());
    await hydrate({ root, fetchImpl: respond({ [url]: bytes }), config });
    assert.deepEqual(readFileSync(join(root, binaryPath)), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hydrate reports a missing object as an upload-not-done failure', async () => {
  const { root } = fixture();
  try {
    await assert.rejects(
      hydrate({ root, fetchImpl: respond({}), config }),
      /upload has not been done/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyRemote lists every missing or wrong-size object', async () => {
  const { root } = fixture();
  try {
    const url = urlFor(pointer());
    const present = await verifyRemote({
      root,
      fetchImpl: respond({ [url]: bytes }, { head: true }),
      config,
    });
    assert.deepEqual([present.missing, present.bad], [[], []]);
    const absent = await verifyRemote({
      root,
      fetchImpl: respond({}),
      config,
    });
    assert.equal(absent.missing.length, 1);
    const wrong = await verifyRemote({
      root,
      fetchImpl: respond({ [url]: Buffer.from('1234') }, { head: true }),
      config,
    });
    assert.equal(wrong.bad.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('SigV4 matches the AWS documented GET Object example', () => {
  const authorization = sigV4Authorization({
    method: 'GET',
    path: '/test.txt',
    headers: {
      host: 'examplebucket.s3.amazonaws.com',
      range: 'bytes=0-9',
      'x-amz-content-sha256':
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'x-amz-date': '20130524T000000Z',
    },
    payloadHash:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    amzDate: '20130524T000000Z',
  });
  assert.match(
    authorization,
    /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/
  );
});

test('the store is private: no credentials means no access, never a pass', async () => {
  const { root } = fixture();
  try {
    assert.equal(storeConfig({}), null);
    await assert.rejects(
      verifyRemote({ root, config: null }),
      /R2 credentials missing/
    );
    await assert.rejects(
      hydrate({ root, config: null }),
      /R2 credentials missing/
    );
    const skipped = await hydrate({ root, config: null, optional: true });
    assert.deepEqual([skipped.downloaded, skipped.skipped], [0, 1]);
    // A server that refuses anonymous requests is never asked anonymously.
    const anonymous = await verifyRemote({
      root,
      config: { ...config, accessKeyId: 'x' },
      fetchImpl: async () => new Response(null, { status: 403 }),
    });
    assert.equal(anonymous.missing.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('upload PUTs the bytes signed, under the content-addressed key', async () => {
  const calls = [];
  await uploadObject(config, pointer(), bytes, async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 200 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, urlFor(pointer()));
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers['content-type'], 'image/png');
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 /);
  await assert.rejects(
    uploadObject(
      config,
      pointer(),
      bytes,
      async () => new Response(null, { status: 403 })
    ),
    /HTTP 403/
  );
});

test('no source file names an unauthenticated store address', () => {
  for (const file of [
    '../screenshot-store.mjs',
    '../r2-store-client.mjs',
    '../../screenshot-store.mjs',
  ])
    assert.doesNotMatch(
      readFileSync(new URL(file, import.meta.url), 'utf8'),
      /screenshots\.jov\.ie|r2\.dev|PUBLIC_BASE/
    );
});

test('served images (public symlink targets, through dedupe links) stay in git', () => {
  const root = mkdtempSync(join(tmpdir(), 'screenshot-served-'));
  try {
    const catalog = join(root, 'apps/web/screenshot-catalog/current');
    const exports = join(root, 'apps/web/public/product-screenshots');
    mkdirSync(catalog, { recursive: true });
    mkdirSync(exports, { recursive: true });
    writeFileSync(join(catalog, 'blob.png'), 'x');
    writeFileSync(join(catalog, 'other.png'), 'y');
    symlinkSync('blob.png', join(catalog, 'twin.png'));
    symlinkSync(
      '../../screenshot-catalog/current/twin.png',
      join(exports, 'twin.png')
    );
    const served = servedCatalogImages(root);
    const base = 'apps/web/screenshot-catalog/current';
    assert.deepEqual([...served].sort(), [
      `${base}/blob.png`,
      `${base}/twin.png`,
    ]);
    assert.equal(isMovedBinary(`${base}/blob.png`, served), false);
    assert.equal(isMovedBinary(`${base}/other.png`, served), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('catalog images imported by app code are served and stay in git', () => {
  const root = mkdtempSync(join(tmpdir(), 'screenshot-imported-'));
  try {
    const catalog = join(root, 'apps/web/screenshot-catalog/current');
    const components = join(root, 'apps/web/components');
    const tests = join(root, 'apps/web/tests');
    mkdirSync(catalog, { recursive: true });
    mkdirSync(components, { recursive: true });
    mkdirSync(tests, { recursive: true });
    for (const name of ['used.png', 'test-only.png', 'unused.png'])
      writeFileSync(join(catalog, name), name);
    writeFileSync(
      join(components, 'Hero.tsx'),
      "import SHOT from '@/screenshot-catalog/current/used.png';\n"
    );
    writeFileSync(
      join(components, 'Hero.test.tsx'),
      "import SHOT from '@/screenshot-catalog/current/test-only.png';\n"
    );
    writeFileSync(
      join(tests, 'shot.ts'),
      "import SHOT from '@/screenshot-catalog/current/test-only.png';\n"
    );
    const served = servedCatalogImages(root);
    assert.deepEqual(
      [...served],
      ['apps/web/screenshot-catalog/current/used.png']
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: verify --remote without credentials fails with an upload-not-verified message', () => {
  const env = { ...process.env };
  for (const name of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ])
    delete env[name];
  const result = spawnSync(
    process.execPath,
    [
      new URL('../../screenshot-store.mjs', import.meta.url).pathname,
      'verify',
      '--remote',
    ],
    { encoding: 'utf8', env }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /upload not verified/);
  assert.match(result.stderr, /R2 credentials missing/);
});

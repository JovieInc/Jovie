import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  binaryPathFor,
  buildPointer,
  hydrate,
  isMovedBinary,
  keyOf,
  pointerPathFor,
  publicUrlOf,
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
/**
 * @param {Record<string, Buffer>} map
 * @returns {typeof fetch}
 */
const respond =
  (map, { head = false } = {}) =>
  async input => {
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
    const url = publicUrlOf(pointer(), {});
    const fetchImpl = respond({ [url]: bytes });
    const first = await hydrate({ root, fetchImpl, env: {} });
    assert.deepEqual([first.downloaded, first.present], [1, 0]);
    assert.deepEqual(readFileSync(join(root, binaryPath)), bytes);
    const second = await hydrate({ root, fetchImpl: respond({}), env: {} });
    assert.deepEqual([second.downloaded, second.present], [0, 1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hydrate rejects tampered bytes and never writes them', async () => {
  const { root, binaryPath } = fixture();
  try {
    const url = publicUrlOf(pointer(), {});
    await assert.rejects(
      hydrate({
        root,
        fetchImpl: respond({ [url]: Buffer.from('tampered!') }),
        env: {},
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
    const url = publicUrlOf(pointer(), {});
    await hydrate({ root, fetchImpl: respond({ [url]: bytes }), env: {} });
    assert.deepEqual(readFileSync(join(root, binaryPath)), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hydrate reports a missing object as an upload-not-done failure', async () => {
  const { root } = fixture();
  try {
    await assert.rejects(
      hydrate({ root, fetchImpl: respond({}), env: {} }),
      /upload has not been done/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyRemote lists every missing or wrong-size object', async () => {
  const { root } = fixture();
  try {
    const url = publicUrlOf(pointer(), {});
    const present = await verifyRemote({
      root,
      fetchImpl: respond({ [url]: bytes }, { head: true }),
      env: {},
    });
    assert.deepEqual([present.missing, present.bad], [[], []]);
    const absent = await verifyRemote({
      root,
      fetchImpl: respond({}),
      env: {},
    });
    assert.equal(absent.missing.length, 1);
    const wrong = await verifyRemote({
      root,
      fetchImpl: respond({ [url]: Buffer.from('1234') }, { head: true }),
      env: {},
    });
    assert.equal(wrong.bad.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

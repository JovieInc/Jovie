import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  isLfsPointerFile,
  materializeStatic,
} from './materialize-vercel-static.mjs';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jovie-static-lfs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes) => {
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
  put('.vercel/output/config.json', '{"version":3}');
  mkdirSync(resolve(root, '.vercel/output/static'));
  return { root, put, link };
}

const pointer =
  'version https://git-lfs.github.com/spec/v1\noid sha256:' +
  'a'.repeat(64) +
  '\nsize 1234\n';

test('recognises only small Git LFS pointer files', t => {
  const f = fixture(t);
  assert.equal(isLfsPointerFile(f.put('pointer.png', pointer)), true);
  assert.equal(isLfsPointerFile(f.put('image.png', '\x89PNG bytes')), false);
  assert.equal(
    isLfsPointerFile(f.put('big.png', pointer + 'x'.repeat(2_000))),
    false
  );
  assert.equal(isLfsPointerFile(f.link('link.png', 'pointer.png')), false);
});

test('refuses Git LFS pointers in the static output before any write', t => {
  const f = fixture(t);
  const pointer =
    'version https://git-lfs.github.com/spec/v1\noid sha256:' +
    'a'.repeat(64) +
    '\nsize 1234\n';
  f.put('apps/web/screenshot-catalog/current/image.png', pointer);
  f.link(
    'apps/web/public/product-screenshots/image.png',
    '../../screenshot-catalog/current/image.png'
  );
  const output = f.link(
    '.vercel/output/static/product-screenshots/image.png',
    '../../screenshot-catalog/current/image.png'
  );
  assert.throws(
    () => materializeStatic(f.root),
    /Git LFS pointers.*screenshot-catalog\/current\/image\.png/
  );
  assert.equal(lstatSync(output).isSymbolicLink(), true);
  f.put('.vercel/output/static/plain.png', pointer);
  assert.throws(() => materializeStatic(f.root), /static\/plain\.png/);
});

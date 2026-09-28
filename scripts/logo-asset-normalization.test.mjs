import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  assertRealRasterFile,
  measureAlphaBounds,
  verifyLogoAssetRegistry,
} from './logo-asset-normalization.mjs';

test('measures deterministic alpha bounds and transparent padding', async () => {
  const measured = await measureAlphaBounds(
    path.resolve(
      import.meta.dirname,
      '../apps/web/public/brand-logos/black-hole-recordings.png'
    )
  );
  assert.deepEqual(measured.visibleBounds, {
    x: 11,
    y: 9,
    width: 1095,
    height: 123,
  });
  assert.deepEqual(measured.cropInset, {
    top: 9,
    right: 13,
    bottom: 14,
    left: 11,
  });
});

test('registered logo assets match measured pixels', async () => {
  assert.deepEqual(await verifyLogoAssetRegistry(), []);
});

test('every registered logo-bar asset resolves to a file on disk', async () => {
  const registry = JSON.parse(
    await readFile(
      path.resolve(
        import.meta.dirname,
        '../apps/web/data/design/logo-assets.json'
      ),
      'utf8'
    )
  );
  for (const asset of registry.assets) {
    const [filePart] = asset.sourcePath.split('#');
    assert.ok(
      existsSync(path.resolve(import.meta.dirname, '..', filePart)),
      `${asset.id}: missing ${filePart}`
    );
  }
});

test('rejects non-raster bytes in raster slots', () => {
  const failures = [];
  assertRealRasterFile(
    path.resolve(import.meta.dirname, '../package.json'),
    'not-an-image',
    failures
  );
  assert.equal(failures.length, 1);
});

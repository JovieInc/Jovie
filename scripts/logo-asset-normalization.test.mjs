import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
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

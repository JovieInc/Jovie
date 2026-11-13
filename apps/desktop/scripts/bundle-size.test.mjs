import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertSizes,
  measureBundles,
  readBaseBaseline,
} from './bundle-size.mjs';

test('compiled main and bundled preload stay within measured gzip baselines', async () => {
  const baseline = JSON.parse(
    await readFile(new URL('./bundle-size.json', import.meta.url), 'utf8')
  );
  const measured = await measureBundles();
  const base = readBaseBaseline();
  if (base === null)
    assert.deepEqual(
      baseline,
      measured,
      'Initial baseline must be measured, without padding'
    );
  assertSizes(measured, baseline, base ?? baseline);
});

test('gzip ratchet accepts shrinking artifacts and rejects growth or raised allowances', () => {
  const baseline = { 'main.js': 200, 'preload.js': 100 };
  assert.doesNotThrow(() =>
    assertSizes({ 'main.js': 199, 'preload.js': 90 }, baseline)
  );
  assert.throws(
    () => assertSizes({ 'main.js': 201, 'preload.js': 100 }, baseline),
    /grew/
  );
  assert.throws(
    () => assertSizes(baseline, { ...baseline, 'main.js': 201 }, baseline),
    /only shrink/
  );
  assert.throws(
    () => assertSizes({ 'main.js': 200 }, baseline),
    /Expected positive/
  );
});

test('push and merge-group empty base refs resolve the same trusted main baseline', () => {
  assert.deepEqual(readBaseBaseline(''), readBaseBaseline('main'));
});

test('deterministic build ignores ambient release metadata and restores no shared files', async () => {
  const generated = new URL(
    '../src/build-identity.generated.ts',
    import.meta.url
  );
  const readGenerated = () =>
    readFile(generated, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  const before = await readGenerated();
  const first = await measureBundles();
  const second = await measureBundles();
  assert.deepEqual(first, second);
  assert.equal(await readGenerated(), before);
});

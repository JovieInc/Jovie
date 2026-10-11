import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareToBaseline,
  FIXTURE_ROOT,
  LAYER_ORDER,
  OVERLAY_LAYER_CHECK_CLASS,
  OVERLAY_LAYER_INVARIANT_ID,
  OVERLAY_LAYER_SCHEMA,
  parseLayerTokens,
  runRatchet,
  scanRawZIndex,
  toIdentities,
  validateLayerOrder,
  validateOverlayLayerContract,
  validateOverlayLayerPolicy,
  validatePrimitiveBindings,
} from './overlay-layer-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function fixture(name) {
  const rel = `${FIXTURE_ROOT}/${name}`;
  return { rel, source: readFileSync(path.join(REPO_ROOT, rel), 'utf8') };
}

function scanFixture(name) {
  const { rel, source } = fixture(name);
  return scanRawZIndex(rel, source);
}

describe('JOV-INV-039 overlay-layer-contract', () => {
  it('rejects increased menu depth or truncation in the existing contract', () => {
    for (const mutation of [
      { maxSubmenuDepth: 2 },
      { overflow: 'truncate' },
      { maxRootActions: 20 },
    ]) {
      const registry = structuredClone(readInvariantRegistry());
      const policy = registry.invariants.find(
        item => item.id === OVERLAY_LAYER_INVARIANT_ID
      ).policy.value;
      Object.assign(policy.menuHierarchy, mutation);
      assert.ok(
        validateOverlayLayerPolicy(registry).some(error =>
          error.includes('menuHierarchy')
        )
      );
    }
  });
  it('keeps the overlay collision check class and layer order', () => {
    assert.equal(OVERLAY_LAYER_INVARIANT_ID, 'JOV-INV-039');
    assert.equal(OVERLAY_LAYER_CHECK_CLASS, 'overlay-collision');
    assert.equal(OVERLAY_LAYER_SCHEMA, 'jovie-overlay-layer-contract/v1');
    assert.deepEqual(LAYER_ORDER, [
      'banner',
      'sheet',
      'modal',
      'popover',
      'tooltip',
    ]);
  });

  it('accepts the checked-in overlay tokens and primitives', () => {
    assert.deepEqual(validateOverlayLayerContract(), []);
  });

  it('holds the raw z-index ratchet at the committed baseline', () => {
    assert.deepEqual(runRatchet().regressions, []);
  });

  it('rejects the deliberate-red fixture', () => {
    const values = [
      ...scanFixture('red/Overlay.tsx'),
      ...scanFixture('red/overlay.css'),
    ].map(item => item.value);
    assert.deepEqual(values.sort(), [
      'z-100',
      'z-[999]',
      'z-index:200',
      'zIndex:500',
    ]);
    const tokenErrors = validateLayerOrder(
      parseLayerTokens(fixture('red/tokens.css').source)
    );
    assert.ok(
      tokenErrors.some(error => error.includes('--z-index-modal (50)')),
      tokenErrors.join('\n')
    );
  });

  it('accepts semantic layers, token references, and local stacking', () => {
    assert.deepEqual(scanFixture('green/Overlay.tsx'), []);
    assert.deepEqual(scanFixture('green/overlay.css'), []);
  });

  it('fails a new raw value and allows a grandfathered one to shrink', () => {
    const baseline = { files: { 'a.tsx': { 'z-50': 2 } } };
    const grown = compareToBaseline(
      toIdentities([
        { path: 'a.tsx', rule: 'global-layer-z-class', value: 'z-50' },
        { path: 'a.tsx', rule: 'global-layer-z-class', value: 'z-50' },
        { path: 'a.tsx', rule: 'global-layer-z-class', value: 'z-50' },
        { path: 'b.tsx', rule: 'arbitrary-z-class', value: 'z-[70]' },
      ]),
      baseline
    );
    assert.equal(grown.regressions.length, 2);
    const shrunk = compareToBaseline(
      toIdentities([
        { path: 'a.tsx', rule: 'global-layer-z-class', value: 'z-50' },
      ]),
      baseline
    );
    assert.deepEqual(shrunk.regressions, []);
    assert.deepEqual(shrunk.shrinks, ['a.tsx: z-50 2 -> 1']);
  });

  it('reports a primitive that drifts back to a number', () => {
    const errors = validatePrimitiveBindings(REPO_ROOT, [
      { path: `${FIXTURE_ROOT}/red/Overlay.tsx`, tokens: ['z-modal'] },
    ]);
    assert.ok(errors.some(error => error.includes('no longer binds z-modal')));
    assert.ok(errors.some(error => error.includes('uses raw z-[999]')));
  });

  it('binds JOV-INV-039 in the adopted registry', () => {
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === OVERLAY_LAYER_INVARIANT_ID
    );
    assert.ok(invariant);
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.deepEqual(invariant.policy.value.layerOrder, LAYER_ORDER);
  });
});

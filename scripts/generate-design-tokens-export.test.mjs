import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generate, loadAnchors } from './generate-design-tokens-export.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Noir Ion anchors load from design-system.css', () => {
  const anchors = loadAnchors();
  assert.equal(anchors['--noir-ion-canvas'], '#030406');
  assert.equal(anchors['--noir-ion-shell'], '#07080a');
  assert.equal(anchors['--noir-ion-card'], '#131417');
  assert.equal(anchors['--noir-ion-text-primary'], '#f5f7fb');
});

test('generated export matches repo-root design.tokens.json', () => {
  const generated = generate();
  const onDisk = readFileSync(join(REPO_ROOT, 'design.tokens.json'), 'utf8');
  assert.equal(onDisk, generated);
});

test('export documents Noir Ion as the generated projection', () => {
  const doc = JSON.parse(generate());
  assert.equal(doc.name, 'Jovie System B (Noir Ion)');
  assert.equal(doc.color['surface.canvas'].$value, '#030406');
  assert.equal(doc.color['surface.surface1'].$value, '#131417');
  assert.match(doc.$description, /generate-design-tokens-export\.mjs/);
});

test('elevation ladder exports resolved per level (JOV-8976)', () => {
  const doc = JSON.parse(generate());
  // L0 window background is the flat plane; L5 = modal + scrim.
  assert.deepEqual(Object.keys(doc.elevation), ['0', '1', '2', '3', '4', '5']);
  assert.equal(doc.elevation['0'].surface.$value, '#07080a');
  assert.equal(doc.elevation['0'].shadow.$value, 'none');
  assert.equal(doc.elevation['1'].surface.$value, 'rgb(7 8 10)');
  assert.equal(doc.elevation['2'].surface.$value, '#131417');
  assert.equal(doc.elevation['2'].border.$value, 'rgba(168, 176, 195, 0.12)');
  assert.equal(
    doc.elevation['2'].shadow.$value,
    '0 0 0 1px rgba(168, 176, 195, 0.12), 0 14px 36px rgba(0, 0, 0, 0.22)'
  );
  assert.equal(doc.elevation['5'].surface.$value, '#1a1b1e');
  assert.equal(doc.elevation['5'].scrim.$value, 'rgba(0, 0, 0, 0.52)');
  for (const level of ['1', '2', '3', '4', '5']) {
    assert.equal(doc.elevation[level].shadow.$type, 'shadow');
    assert.match(doc.elevation[level].shadow.$value, /^0 0 0 1px /);
  }
  for (const level of ['0', '1', '2', '3', '4', '5']) {
    for (const part of ['surface', 'border']) {
      assert.equal(doc.elevation[level][part].$type, 'color');
      assert.doesNotMatch(doc.elevation[level][part].$value, /var\(/);
    }
  }
});

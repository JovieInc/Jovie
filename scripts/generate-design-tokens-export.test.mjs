import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  generate,
  loadAnchors,
  loadChromeTokens,
} from './generate-design-tokens-export.mjs';

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

test('window chrome exports the locked geometry from CSS', () => {
  const { chrome, motion } = loadChromeTokens();
  assert.equal(chrome['titleRow.height'].$value, '44px');
  assert.equal(chrome['trafficLights.reserve'].$value, '76px');
  assert.equal(chrome['sidebar.width'].$value, '240px');
  assert.equal(motion['sidebar.collapse'].$value, '160ms');
  assert.equal(motion['sidebar.expand'].$value, '220ms');
  assert.throws(() => loadChromeTokens(''), /Missing chrome token/);
});

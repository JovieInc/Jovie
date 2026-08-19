import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generate, loadAnchors } from './generate-design-tokens-export.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Noir Ion anchors load from design-system.css', () => {
  const anchors = loadAnchors();
  assert.equal(anchors['--noir-ion-canvas'], '#030407');
  assert.equal(anchors['--noir-ion-shell'], '#06080d');
  assert.equal(anchors['--noir-ion-card'], '#0f1420');
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
  assert.equal(doc.color['surface.canvas'].$value, '#030407');
  assert.equal(doc.color['surface.surface1'].$value, '#0f1420');
  assert.match(doc.$description, /generate-design-tokens-export\.mjs/);
});

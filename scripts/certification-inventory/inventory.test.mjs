import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  dependentsOf,
  INVENTORY_SCHEMA,
  loadInventory,
  summarize,
  validateInventory,
  validateObject,
} from './inventory.mjs';

const canonicalPath = fileURLToPath(
  new URL('./inventory.json', import.meta.url)
);

function object(overrides = {}) {
  return {
    id: 'capability:test-a',
    title: 'Test capability',
    layer: 'capability',
    status: 'never-evaluated',
    owner: 'tests',
    prerequisites: [],
    journeys: [],
    surfaces: ['api'],
    risk: 'low',
    uiRequired: false,
    expectedEvidence: ['probe'],
    issues: [],
    ...overrides,
  };
}

function inventory(objects = [object()]) {
  return {
    schema: INVENTORY_SCHEMA,
    inventoryVersion: 'test-v1',
    issue: 'JOV-7328',
    asOf: '2026-09-30T00:00:00Z',
    objects,
  };
}

test('canonical inventory validates', () => {
  const data = loadInventory(canonicalPath);
  assert.ok(data.objects.length >= 10);
});

test('canonical inventory encodes the Music Resolver canary chain', () => {
  const { objects } = loadInventory(canonicalPath);
  const byId = new Map(objects.map(o => [o.id, o]));
  assert.deepEqual(
    byId.get('capability:music-catalog-resolution').prerequisites,
    ['capability:artist-identity-resolution']
  );
  assert.deepEqual(
    byId.get('capability:smartlink-create-resolve').prerequisites,
    ['capability:canonical-release-data']
  );
  const chain = dependentsOf(objects, 'capability:music-catalog-resolution');
  for (const id of [
    'capability:canonical-release-data',
    'capability:smartlink-create-resolve',
    'experience:smartlink-fan-click',
  ]) {
    assert.ok(chain.has(id), `expected ${id} to depend on music resolution`);
  }
});

test('rejects dependency cycles', () => {
  const a = object({
    id: 'capability:test-aa',
    prerequisites: ['capability:test-bb'],
  });
  const b = object({
    id: 'capability:test-bb',
    prerequisites: ['capability:test-aa'],
  });
  assert.throws(() => validateInventory(inventory([a, b])), /cycle/);
});

test('rejects unknown prerequisite references', () => {
  const a = object({ prerequisites: ['capability:missing'] });
  assert.throws(
    () => validateInventory(inventory([a])),
    /unknown prerequisite/
  );
});

test('rejects duplicate ids, bad status, self-dependency', () => {
  assert.throws(
    () => validateInventory(inventory([object(), object()])),
    /duplicate/
  );
  assert.throws(
    () => validateObject(object({ status: 'green' })),
    /invalid status/
  );
  assert.throws(
    () => validateObject(object({ prerequisites: ['capability:test-a'] })),
    /self-dependency/
  );
});

test('layer/id prefix and experience journey binding enforced', () => {
  assert.throws(
    () => validateObject(object({ id: 'surface:test-a' })),
    /must start with capability:/
  );
  assert.throws(
    () =>
      validateObject(object({ id: 'experience:test-x', layer: 'experience' })),
    /at least one journey/
  );
});

test('summarize reports denominator counts', () => {
  const { objects } = loadInventory(canonicalPath);
  const summary = summarize(objects);
  assert.equal(summary.total, objects.length);
  assert.equal(
    Object.values(summary.byStatus).reduce((a, b) => a + b, 0),
    objects.length
  );
  assert.ok(summary.byLayer.capability >= 1);
  assert.ok(summary.byLayer.experience >= 1);
});

test('loadInventory rejects non-inventory files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cert-inv-'));
  try {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schema: 'nope', objects: [] }));
    assert.throws(() => loadInventory(bad), /certification-inventory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

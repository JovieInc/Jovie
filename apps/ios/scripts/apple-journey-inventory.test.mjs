import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPLE_JOURNEYS,
  PRIMARY_SPINE_IDS,
  checkEvidencePaths,
  checkManifestRouteIds,
  checkMeasurementHooks,
  summarizeInventory,
} from './apple-journey-inventory.mjs';

test('catalog declares the three primary value spines', () => {
  assert.ok(
    PRIMARY_SPINE_IDS.some(id => id.startsWith('jovie-ios.')),
    'Jovie iOS spine'
  );
  assert.ok(
    PRIMARY_SPINE_IDS.some(id => id.startsWith('lyb-ios.')),
    'LYB iOS spine'
  );
  assert.ok(
    PRIMARY_SPINE_IDS.some(id => id.startsWith('jovie-macos.')),
    'Mac spine'
  );
});

test('every journey has a valueRole and Mac honesty flag', () => {
  for (const journey of APPLE_JOURNEYS) {
    assert.ok(journey.id, 'id');
    assert.ok(
      ['ttmv', 'return', 'support', 'measurement'].includes(journey.valueRole),
      `${journey.id} valueRole`
    );
    assert.equal(typeof journey.requiresMac, 'boolean', journey.id);
    if (journey.app === 'lyb-ios') {
      assert.equal(journey.externalRepo, 'JovieInc/LogYourBody');
      assert.equal(journey.evidencePaths.length, 0);
    }
  }
});

test('primary spines carry addendum §1 value hypotheses', () => {
  for (const journey of APPLE_JOURNEYS.filter(j => j.primarySpine)) {
    assert.ok(
      journey.valueHypothesis && journey.valueHypothesis.length > 8,
      `${journey.id} needs valueHypothesis`
    );
  }
});

test('Jovie evidence paths exist in this checkout', () => {
  const { ok, missing } = checkEvidencePaths();
  assert.deepEqual(missing, []);
  assert.equal(ok, true);
});

test('AppRouteManifest still declares required route ids', () => {
  const { ok, missing } = checkManifestRouteIds();
  assert.deepEqual(missing, []);
  assert.equal(ok, true);
});

test('declared measurement hooks still exist in ObservabilityEvent', () => {
  const { ok, missing } = checkMeasurementHooks();
  assert.deepEqual(missing, []);
  assert.equal(ok, true);
});

test('summary stays honest that interactive Mac proof is required', () => {
  const summary = summarizeInventory();
  assert.equal(summary.schema, 'jovie.apple-journey-inventory/v1');
  assert.match(summary.addendumAlignment, /§§1–2/);
  assert.ok(summary.requiresMacCount >= PRIMARY_SPINE_IDS.length);
  assert.equal(summary.pathCheck.ok, true);
  assert.equal(summary.manifestCheck.ok, true);
  assert.equal(summary.measurementCheck.ok, true);
});

test('does not claim live Mac execution succeeded', () => {
  for (const journey of APPLE_JOURNEYS) {
    assert.notEqual(journey.catalogStatus, 'live-passed');
    if (journey.requiresMac) {
      assert.ok(
        (journey.macCommands ?? []).length > 0,
        `${journey.id} needs macCommands documentation`
      );
    }
  }
});

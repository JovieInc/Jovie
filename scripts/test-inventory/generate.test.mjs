import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildInventory, generate, isExecutableTestFile } from './generate.mjs';
import { CLASSIFICATIONS, validateInventory } from './schema.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const inventory = buildInventory(files);

test('schema accepts the complete generated inventory', () => {
  assert.deepEqual(validateInventory(inventory), []);
  assert.ok(inventory.testFiles.length > 0);
  assert.ok(inventory.ciLanes.length > 0);
});

test('inventory covers every tracked executable test exactly once', () => {
  const expected = files.filter(isExecutableTestFile).sort();
  const actual = inventory.testFiles.map(record => record.path).sort();
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length);
});

test('all classifications use the exact allowed enum', () => {
  for (const record of [...inventory.testFiles, ...inventory.ciLanes]) {
    assert.ok(CLASSIFICATIONS.includes(record.classification), record.id);
    assert.ok(record.rationale.length > 0, record.id);
  }
});

test('every null metric has provenance', () => {
  for (const record of [...inventory.testFiles, ...inventory.ciLanes]) {
    for (const [name, value] of Object.entries(record.metrics)) {
      if (name.endsWith('Ms') && value === null) {
        assert.ok(record.metrics.nullReason, `${record.id}.${name}`);
      }
    }
  }
});

test('checked-in JSON and docs regenerate deterministically', () => {
  generate({ check: true });
  const checkedIn = JSON.parse(
    readFileSync(resolve(root, 'docs/testing/test-inventory.json'), 'utf8')
  );
  assert.deepEqual(checkedIn, inventory);
  assert.match(
    readFileSync(resolve(root, 'docs/testing/test-taxonomy.md'), 'utf8'),
    /Canonical Test Taxonomy/
  );
  assert.match(
    readFileSync(
      resolve(root, 'docs/testing/test-performance-baseline.md'),
      'utf8'
    ),
    /Ratchet policy/
  );
});

test('workflow discovery excludes prose-only jobs and keeps only real triggers', () => {
  assert.equal(
    inventory.ciLanes.some(record =>
      record.id.includes('agent-harness-health-report.yml#report')
    ),
    false
  );
  assert.equal(
    inventory.ciLanes.some(record =>
      record.id.includes('agent-landing-sweep.yml#sweep')
    ),
    false
  );
  const unit = inventory.ciLanes.find(record =>
    record.id.endsWith('ci.yml#ci-unit-tests')
  );
  assert.deepEqual(unit.ci.triggers, [
    'pull_request',
    'push',
    'workflow_dispatch',
  ]);
  assert.equal(unit.ci.blocking, null);
  assert.match(unit.ci.reason, /branch-protection/);
  assert.equal(
    unit.dependencies.real.some(value => value === '|'),
    false
  );
});

test('discovers representative executable CI lanes from invoked commands', () => {
  const examples = [
    ['ci.yml#ci-unit-tests', 'service integration'],
    ['ci.yml#ci-lighthouse-pr', 'full/visual/a11y E2E'],
    ['ios-ci.yml#test', 'iOS integration/UI'],
    ['reusable-ci-lint.yml#promptfoo-evals', 'deterministic eval'],
    ['eval-real-model.yml#real-model-eval', 'live eval'],
  ];
  for (const [suffix, classification] of examples) {
    const lane = inventory.ciLanes.find(record => record.id.endsWith(suffix));
    assert.ok(lane, suffix);
    assert.equal(lane.classification, classification, suffix);
    assert.ok(lane.dependencies.real.length > 0, suffix);
  }
  const judgedEval = inventory.ciLanes.find(record =>
    record.id.endsWith('eval.yml#eval')
  );
  assert.equal(judgedEval.classification, 'live eval');
  assert.match(judgedEval.rationale.join(' '), /live\/real provider/);
});

test('maps known file families and exposes current coverage gaps', () => {
  const byPath = path =>
    inventory.testFiles.find(record => record.path === path);
  const smoke = byPath('apps/web/tests/e2e/smoke-auth.spec.ts');
  assert.ok(smoke.ci.jobs.some(job => job.endsWith('#ci-e2e-smoke')));
  assert.equal(smoke.ci.mappingConfidence, 'medium');

  const ios = byPath('apps/ios/JovieTests/APIClientTests.swift');
  assert.ok(ios.ci.jobs.includes('.github/workflows/ios-ci.yml#test'));
  assert.equal(ios.ci.mappingConfidence, 'high');

  const database = byPath(
    'apps/web/tests/integration/rls-access-control.test.ts'
  );
  assert.deepEqual(database.ci.jobs, []);
  assert.deepEqual(database.ci.suiteCandidates, []);
  assert.match(database.ci.mappingProvenance, /explicitly excludes/);
  assert.match(database.ci.mappingProvenance, /JOV-4195\/\#13967/);

  for (const path of [
    'apps/desktop/scripts/desktop-auth-security.test.ts',
    'apps/desktop/scripts/desktop-tray-contract.test.mjs',
  ]) {
    const covered = byPath(path);
    assert.deepEqual(covered.ci.jobs, []);
    assert.deepEqual(covered.ci.suiteCandidates, [
      'pnpm --filter @jovie/desktop test',
    ]);
    assert.match(covered.ci.mappingProvenance, /recursively discovers/);
  }

  const desktop = byPath('apps/desktop/scripts/desktop-icon-contract.test.mjs');
  assert.deepEqual(desktop.ci.jobs, []);
  assert.deepEqual(desktop.ci.suiteCandidates, [
    'pnpm --filter @jovie/desktop test',
  ]);
  assert.match(desktop.ci.mappingProvenance, /recursively discovers/);

  const rootTest = byPath('scripts/test-inventory/generate.test.mjs');
  assert.deepEqual(rootTest.ci.suiteCandidates, []);
  assert.match(
    rootTest.ci.mappingProvenance,
    /runner and lane remain unproven/
  );

  const deterministicEval = byPath('apps/web/lib/eval/calibration.test.ts');
  assert.deepEqual(deterministicEval.ci.suiteCandidates, [
    'pnpm test:evals:deterministic',
  ]);
  assert.equal(deterministicEval.classification, 'deterministic eval');
  assert.equal(deterministicEval.ci.mappingConfidence, 'high');

  const liveEval = byPath(
    'apps/web/tests/eval/golden/golden-eval-set.real.test.ts'
  );
  assert.deepEqual(liveEval.ci.suiteCandidates, ['pnpm test:evals:live']);
  assert.equal(liveEval.classification, 'live eval');
  assert.equal(liveEval.ci.mappingConfidence, 'high');

  const visualBreakpoint = byPath(
    'apps/web/tests/visual-qa/breakpoint-check.spec.ts'
  );
  assert.deepEqual(visualBreakpoint.ci.jobs, []);
  assert.deepEqual(visualBreakpoint.ci.suiteCandidates, [
    'pnpm test:visual:breakpoints',
  ]);
  assert.equal(visualBreakpoint.classification, 'full/visual/a11y E2E');
  assert.equal(visualBreakpoint.ci.mappingConfidence, 'high');

  const visualSelectionContract = byPath(
    'apps/web/scripts/visual-qa-lane.test.mjs'
  );
  assert.deepEqual(visualSelectionContract.ci.jobs, []);
  assert.deepEqual(visualSelectionContract.ci.suiteCandidates, [
    'pnpm --filter @jovie/web run test:visual:breakpoints:selection',
  ]);
  assert.equal(visualSelectionContract.classification, 'contract/structural');
  assert.equal(visualSelectionContract.ci.mappingConfidence, 'high');
});

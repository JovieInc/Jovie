import assert from 'node:assert/strict';
import test from 'node:test';
import { certifyNativeReceipt, SCHEMA } from './lyb-native-certification.mjs';

const routeTest =
  'LogYourBodyUITests/testLaunchQualityGateCapturesCriticalSurfaces()';
const shareTest =
  'LogYourBodyUITests/testLaunchQualityGateCapturesBodyScoreShare()';
const actionTest =
  'LogYourBodyUITests/testMetricCardExposesAccessibleActions()';
const manifest = () => ({
  schema: SCHEMA,
  sourceIssue: 'JOV-6095',
  paths: [
    {
      id: 'route.chat',
      tier: 'simulator_interaction',
      testIds: [routeTest],
      requiredCaptures: ['chat-tab'],
    },
    {
      id: 'share.score-only',
      tier: 'simulator_interaction',
      testIds: [shareTest],
      requiredCaptures: ['body-score-share'],
    },
    {
      id: 'metric.actions',
      tier: 'simulator_interaction',
      testIds: [actionTest],
      requiredCaptures: ['metric-actions'],
    },
  ],
  humanOnlyGates: [
    {
      id: 'testflight.purchase-restore',
      reason: 'Apple sandbox account and physical candidate required',
    },
  ],
});

function receipt() {
  const testIds = [routeTest, shareTest, actionTest];
  return {
    schema: SCHEMA,
    source: {
      gitSha: 'a'.repeat(40),
      mergedSha: 'a'.repeat(40),
      workflowRunId: 36293550868,
    },
    build: {
      bundleId: 'com.logyourbody.app',
      version: '1.2.0',
      buildNumber: '120',
      installedGitSha: 'a'.repeat(40),
    },
    toolchain: { xcodeVersion: '26.0.1 (17A400)', swiftVersion: '6.2' },
    device: {
      kind: 'simulator',
      name: 'iPhone 16',
      osVersion: '26.2',
      osBuild: '23C54',
    },
    fixture: { sha256: 'b'.repeat(64), seed: 6099 },
    configuration: { name: 'Debug', flags: ['-lybUITestRouteFixture'] },
    xcresult: {
      sha256: 'c'.repeat(64),
      artifact: 'ios-launch-quality-gate-36293550868',
    },
    discoveredTestIds: testIds,
    selectedTestIds: testIds,
    records: testIds.map(testId => ({ testId, result: 'Passed' })),
    captures: ['chat-tab', 'body-score-share', 'metric-actions'].map(name => ({
      name,
      sha256: 'd'.repeat(64),
    })),
    recoveredAfterRetry: false,
    infrastructureSkip: false,
  };
}

test('certifies a changed-path installed-build replay with exact xcresult records', () => {
  const result = certifyNativeReceipt(manifest(), receipt());
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.counts, {
    declared: 3,
    discovered: 3,
    selected: 3,
    executed: 3,
    passed: 3,
    failed: 0,
    skipped: 0,
  });
  assert.equal(result.humanOnlyGates[0].id, 'testflight.purchase-restore');
});

test('rejects a green hosted run whose installed build and required case are absent', () => {
  const candidate = receipt();
  candidate.build.installedGitSha = 'not_verified';
  candidate.selectedTestIds = [routeTest, shareTest];
  candidate.records = candidate.records.filter(
    record => record.testId !== actionTest
  );
  const result = certifyNativeReceipt(manifest(), candidate);
  assert.equal(result.verdict, 'UNVERIFIED');
  for (const reason of [
    'installed-build-sha-mismatch',
    `not-selected:${actionTest}`,
    `not-executed:${actionTest}`,
  ])
    assert.ok(result.reasons.includes(reason));
});

test('negative control catches a failed route interaction instead of trusting workflow green', () => {
  const defective = receipt();
  defective.records[0].result = 'Failed';
  const result = certifyNativeReceipt(manifest(), defective);
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.ok(result.reasons.includes(`failed:${routeTest}`));
  assert.equal(result.counts.failed, 1);
});

test('rejects zero tests, missing artifacts, infrastructure skips, and flaky-only success', () => {
  const invalid = receipt();
  invalid.records = [];
  invalid.xcresult.sha256 = '';
  invalid.infrastructureSkip = true;
  invalid.recoveredAfterRetry = true;
  const result = certifyNativeReceipt(manifest(), invalid);
  assert.equal(result.verdict, 'UNVERIFIED');
  for (const reason of [
    'zero-test-run',
    'missing-xcresult',
    'infrastructure-skip',
    'flaky-only-success',
  ])
    assert.ok(result.reasons.includes(reason));
});

test('rejects a required xcresult record reported as skipped', () => {
  const invalid = receipt();
  invalid.records[1].result = 'Skipped';
  const result = certifyNativeReceipt(manifest(), invalid);
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.ok(result.reasons.includes(`skipped:${shareTest}`));
  assert.equal(result.counts.skipped, 1);
});

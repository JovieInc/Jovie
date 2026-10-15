import assert from 'node:assert/strict';
import test from 'node:test';
import {
  END,
  expectedExposure,
  exposureEvidence,
  START,
} from '../packages/release-channel-contracts/test-fixtures/dogfood-exposure.ts';
import {
  LAUNCH_CONTRACT,
  LAUNCH_CONTRACT_DIGEST,
} from './lyb-launch-contract.mjs';
import { certifyNativeReceipt, SCHEMA } from './lyb-native-certification.mjs';

// Synthetic oracle inputs, not identifiers of implemented LYB XCTest cases.
const launchPaths = LAUNCH_CONTRACT.requiredPaths.map(path => ({
  ...path,
  testIds: [`FixtureLaunchTests/${path.id}()`],
}));

const routeTest =
  'LogYourBodyUITests/testLaunchQualityGateCapturesCriticalSurfaces()';
const shareTest =
  'LogYourBodyUITests/testLaunchQualityGateCapturesBodyScoreShare()';
const actionTest =
  'LogYourBodyUITests/testMetricCardExposesAccessibleActions()';
const manifest = () => ({
  schema: SCHEMA,
  sourceIssue: 'JOV-6095',
  launchContract: {
    schema: LAUNCH_CONTRACT.schema,
    digest: LAUNCH_CONTRACT_DIGEST,
    primarySurfaces: [...LAUNCH_CONTRACT.primarySurfaces],
    surfaces: { ...LAUNCH_CONTRACT.surfaces },
  },
  paths: [
    ...structuredClone(launchPaths),
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
  const testIds = [
    routeTest,
    shareTest,
    actionTest,
    ...launchPaths.flatMap(path => path.testIds),
  ];
  return {
    schema: SCHEMA,
    launchContractDigest: LAUNCH_CONTRACT_DIGEST,
    source: {
      repository: 'JovieInc/LogYourBody',
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
    captures: [
      'chat-tab',
      'body-score-share',
      'metric-actions',
      ...launchPaths.flatMap(path => path.requiredCaptures),
    ].map(name => ({
      name,
      sha256: 'd'.repeat(64),
    })),
    recoveredAfterRetry: false,
    infrastructureSkip: false,
  };
}

test('native exposure requires installed identity, real captures and no fixture overrides', () => {
  const expected = expectedExposure('lyb');
  const scope = { ...manifest(), expectedExposure: expected };
  const native = {
    ...receipt(),
    startedAt: START,
    completedAt: END,
    configuration: { name: 'Release', flags: [] },
    exposure: exposureEvidence(expected),
  };
  assert.equal(certifyNativeReceipt(scope, native).verdict, 'PASS');
  assert.equal(
    certifyNativeReceipt(scope, { ...native, exposure: undefined }).verdict,
    'UNKNOWN_CONFIGURATION'
  );
  assert.equal(
    certifyNativeReceipt(scope, {
      ...native,
      build: { ...native.build, installedGitSha: 'b'.repeat(40) },
    }).verdict,
    'BLOCKED_BUILD'
  );
  assert.equal(
    certifyNativeReceipt(scope, { ...native, captures: [] }).verdict,
    'BLOCKED_EXPOSURE'
  );
  assert.equal(
    certifyNativeReceipt(scope, {
      ...native,
      configuration: receipt().configuration,
    }).verdict,
    'BLOCKED_EXPOSURE'
  );
  const changed = {
    ...native,
    exposure: {
      ...native.exposure,
      observations: native.exposure.observations.map((observation, index) =>
        index === 1
          ? {
              ...observation,
              configuration: {
                ...observation.configuration,
                generation: 'next',
              },
            }
          : observation
      ),
    },
  };
  assert.equal(
    certifyNativeReceipt(scope, changed).verdict,
    'UNKNOWN_CONFIGURATION'
  );
});

test('certifies a changed-path installed-build replay with exact xcresult records', () => {
  const result = certifyNativeReceipt(manifest(), receipt());
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.counts, {
    declared: 16,
    discovered: 16,
    selected: 16,
    executed: 16,
    passed: 16,
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

test('launch fixture pins the narrow audience, optional wedge and audited surface inventory', () => {
  assert.deepEqual(LAUNCH_CONTRACT.primarySurfaces, [
    'ios.screen.photoTimeline',
    'ios.screen.stats',
    'ios.screen.chat',
  ]);
  assert.deepEqual(LAUNCH_CONTRACT.promise.requiredInputs, [
    'constraints',
    'outcome',
    'outcomeDate',
  ]);
  assert.ok(LAUNCH_CONTRACT.promise.optionalInputs.includes('dexa'));
  assert.ok(LAUNCH_CONTRACT.promise.optionalInputs.includes('glp1Disclosure'));
  const ids = Object.keys(LAUNCH_CONTRACT.surfaces);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(ids.filter(id => id.startsWith('ios.screen.')).length, 46);
  assert.equal(ids.filter(id => id.startsWith('web:')).length, 34);
  assert.equal(ids.length, 87);
  assert.ok(
    Object.values(LAUNCH_CONTRACT.surfaces).every(disposition =>
      ['launch', 'repair', 'hide', 'delete'].includes(disposition)
    )
  );
});

const scopeDriftCases = [
  [
    'missing contract',
    scope => {
      delete scope.launchContract;
    },
    'launch-contract-schema-mismatch',
  ],
  [
    'stale policy',
    scope => {
      scope.launchContract.digest = 'old';
    },
    'launch-contract-digest-mismatch',
  ],
  [
    'extra primary surface',
    scope => {
      scope.launchContract.primarySurfaces.push(
        'ios.sheet.trainingLiveSession'
      );
    },
    'launch-primary-surfaces-mismatch',
  ],
  [
    'hidden surface promoted',
    scope => {
      scope.launchContract.surfaces['ios.screen.shareBodyScore'] = 'launch';
    },
    'launch-surface-mismatch:ios.screen.shareBodyScore',
  ],
  [
    'missing classified surface',
    scope => {
      delete scope.launchContract.surfaces['web:/dashboard'];
    },
    'launch-surface-mismatch:web:/dashboard',
  ],
  [
    'unknown surface',
    scope => {
      scope.launchContract.surfaces['ios.screen.socialFeed'] = 'launch';
    },
    'launch-unclassified-surface:ios.screen.socialFeed',
  ],
  [
    'missing deadline path',
    scope => {
      scope.paths = scope.paths.filter(path => path.id !== 'launch.deadline');
    },
    'launch-path-count:launch.deadline',
  ],
  [
    'duplicate deadline path',
    scope => {
      scope.paths.push(
        structuredClone(scope.paths.find(path => path.id === 'launch.deadline'))
      );
    },
    'launch-path-count:launch.deadline',
  ],
  [
    'policy-only deadline test',
    scope => {
      scope.paths.find(path => path.id === 'launch.deadline').tier =
        'component_unit';
    },
    'launch-path-tier:launch.deadline',
  ],
  [
    'omitted deadline capture',
    scope => {
      scope.paths.find(path => path.id === 'launch.deadline').requiredCaptures =
        [];
    },
    'launch-path-capture:launch.deadline:outcome-date',
  ],
];

for (const [name, mutate, reason] of scopeDriftCases) {
  test(`launch certification rejects ${name} even when all executed tests passed`, () => {
    const scope = manifest();
    mutate(scope);
    const result = certifyNativeReceipt(scope, receipt());
    assert.equal(result.verdict, 'UNVERIFIED');
    assert.ok(result.reasons.includes(reason), result.reasons.join(', '));
  });
}

test('launch certification rejects stale receipt policy and a foreign product repository', () => {
  for (const [mutate, reason] of [
    [
      candidate => {
        candidate.launchContractDigest = 'old';
      },
      'launch-contract-digest-mismatch',
    ],
    [
      candidate => {
        candidate.source.repository = 'JovieInc/Jovie';
      },
      'launch-repository-mismatch',
    ],
    [
      candidate => {
        candidate.schema = 'lyb-native-certification/v1';
      },
      'schema-mismatch',
    ],
  ]) {
    const candidate = receipt();
    mutate(candidate);
    const result = certifyNativeReceipt(manifest(), candidate);
    assert.equal(result.verdict, 'UNVERIFIED');
    assert.ok(result.reasons.includes(reason));
  }
});

test('launch certification requires executed deadline and isolation tests plus actual captures', () => {
  for (const pathId of ['launch.deadline', 'launch.memory-isolation']) {
    const candidate = receipt();
    const testId = launchPaths.find(path => path.id === pathId).testIds[0];
    candidate.records = candidate.records.filter(
      record => record.testId !== testId
    );
    const result = certifyNativeReceipt(manifest(), candidate);
    assert.equal(result.verdict, 'UNVERIFIED');
    assert.ok(result.reasons.includes(`not-executed:${testId}`));
  }
  const candidate = receipt();
  candidate.captures = candidate.captures.filter(
    capture => capture.name !== 'outcome-date'
  );
  const result = certifyNativeReceipt(manifest(), candidate);
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.ok(
    result.reasons.includes('missing-capture:launch.deadline:outcome-date')
  );
});

test('launch certification fails closed on absent inputs and missing capture declarations', () => {
  const absent = certifyNativeReceipt(undefined, undefined);
  assert.equal(absent.verdict, 'UNVERIFIED');
  assert.ok(absent.reasons.includes('launch-path-count:launch.deadline'));

  const scope = manifest();
  scope.paths.unshift(null);
  delete scope.paths.find(path => path?.id === 'launch.deadline')
    .requiredCaptures;
  const result = certifyNativeReceipt(scope, receipt());
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.ok(result.reasons.includes('path-without-id'));
  assert.ok(
    result.reasons.includes('launch-path-capture:launch.deadline:outcome-date')
  );
});

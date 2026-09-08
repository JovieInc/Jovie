import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVALUATION_RECEIPT_SCHEMA,
  REGISTRY_SCHEMA,
  REPORT_SCHEMA,
  validateRegistry,
  validateReport,
} from './contracts.mjs';
import { RECEIPT_SCHEMA } from './receipt-trust.mjs';

const sourceVersion = '6599a876fde20da8482f4280c79e82889de391e9';

function capability(overrides = {}) {
  return {
    id: 'SUMMER-COMM-TEST-001',
    capability: 'Synthetic round trip',
    canonicalPath: ['fixture.txt'],
    implementationState: 'already_works',
    status: 'passing',
    critical: true,
    evidence: [],
    lastVerified: null,
    invalidationCondition: 'fixture or probe version changes',
    ownerRemediation: { owner: 'Summer', refs: ['JOV-5853'] },
    probe: {
      id: 'summer.synthetic.round-trip',
      version: '1.0.0',
      fixture: 'synthetic-fixture/v1',
      expectedState: 'round_trip_observed',
      requiresRuntimeReceipt: true,
      sourceAssertions: [
        { kind: 'file_contains', path: 'fixture.txt', value: 'canonical' },
      ],
    },
    ...overrides,
  };
}

function registry(capabilities = [capability()]) {
  return {
    schema: REGISTRY_SCHEMA,
    registryVersion: 'test-v1',
    certificationContract: 'jovie.certification/v1',
    issue: 'JOV-5853',
    intendedEnvironment: 'production-like',
    trustedAttestationKeyFingerprints: ['a'.repeat(64)],
    auditedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshot: {
      repository: 'JovieInc/Jovie',
      ref: 'origin/main',
      sha: sourceVersion,
    },
    capabilities,
  };
}

function evaluationReceipt(probeId, outcome = 'failed') {
  const passed = outcome === 'passed';
  return {
    schema: EVALUATION_RECEIPT_SCHEMA,
    probeId,
    probeVersion: '1.0.0',
    capabilityId: `CAP-${probeId}`,
    critical: true,
    fixture: 'fixture/v1',
    expectedState: 'expected',
    actualState: passed ? 'certified' : 'blocked',
    correlationId: `summer-test:${probeId}`,
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    startedAt: '2026-09-01T00:00:00.000Z',
    completedAt: '2026-09-01T00:00:00.010Z',
    latencyMs: 10,
    outcome,
    sourceAssertions: [
      {
        kind: 'file_exists',
        path: 'fixture.txt',
        expected: 'file exists',
        actual: 'file exists',
        passed: true,
      },
    ],
    runtimeReceiptPath: passed ? '/tmp/signed-runtime-receipt.json' : null,
    runtimeReceiptCorrelationId: passed ? `summer-runtime:${probeId}` : null,
    failureArtifact: passed
      ? null
      : {
          capabilityId: `CAP-${probeId}`,
          implementationState: 'missing',
          auditedStatus: 'blocked',
          blockers: ['blocked'],
          ownerRemediation: { owner: 'Summer', refs: ['JOV-5853'] },
        },
  };
}

function reportArtifact(receipts) {
  const certified = receipts.filter(
    receipt => receipt.actualState === 'certified'
  ).length;
  const blocking = receipts.filter(
    receipt => receipt.critical && receipt.outcome !== 'passed'
  ).length;
  return {
    schema: REPORT_SCHEMA,
    registrySchema: REGISTRY_SCHEMA,
    registryVersion: 'test-v1',
    registryDigest: 'a'.repeat(64),
    attestationKeyFingerprint: 'b'.repeat(64),
    certificationContract: 'jovie.certification/v1',
    issue: 'JOV-5853',
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    generatedAt: '2026-09-01T00:00:00.010Z',
    commissioned: blocking === 0,
    summary: { capabilities: receipts.length, certified, blocking },
    receipts,
  };
}

test('rejects duplicate probe IDs before evaluation', () => {
  assert.throws(
    () =>
      validateRegistry(registry([capability(), capability({ id: 'OTHER' })])),
    /duplicate probe ID/u
  );
  const differentVersion = capability({
    id: 'OTHER',
    probe: { ...capability().probe, version: '2.0.0' },
  });
  assert.throws(
    () => validateRegistry(registry([capability(), differentVersion])),
    /duplicate probe ID/u
  );
});

test('validates every registry boundary before reading source', () => {
  /** @type {Array<[(value: any) => any, RegExp]>} */
  const cases = [
    [() => 'replace-root', /registry must be an object/u],
    [value => (value.schema = 'wrong'), /registry.schema/u],
    [value => (value.registryVersion = ''), /registry.registryVersion/u],
    [value => (value.capabilities = []), /registry.capabilities/u],
    [
      value => (value.sourceSnapshot = null),
      /sourceSnapshot must be an object/u,
    ],
    [
      value => (value.sourceSnapshot.repository = ''),
      /sourceSnapshot.repository/u,
    ],
    [value => (value.sourceSnapshot.ref = ''), /sourceSnapshot.ref/u],
    [value => (value.sourceSnapshot.sha = 'main'), /exact git SHA/u],
    [
      value => (value.trustedAttestationKeyFingerprints = null),
      /must be an array/u,
    ],
    [
      value => (value.trustedAttestationKeyFingerprints = ['bad']),
      /SHA-256 digest/u,
    ],
    [
      value =>
        (value.trustedAttestationKeyFingerprints = [
          'a'.repeat(64),
          'a'.repeat(64),
        ]),
      /duplicate trusted attestation key fingerprint/u,
    ],
    [value => (value.capabilities[0] = null), /must be an object/u],
    [
      value =>
        value.capabilities.push(
          capability({ probe: { ...capability().probe, id: 'other-probe' } })
        ),
      /duplicate capability id/u,
    ],
    [value => (value.capabilities[0].capability = ''), /capability must be/u],
    [value => (value.capabilities[0].canonicalPath = []), /canonicalPath/u],
    [
      value => (value.capabilities[0].canonicalPath = ['']),
      /canonicalPath\[0\]/u,
    ],
    [
      value => (value.capabilities[0].implementationState = 'unknown'),
      /implementationState/u,
    ],
    [value => (value.capabilities[0].status = 'green'), /status is invalid/u],
    [
      value => (value.capabilities[0].critical = 'yes'),
      /critical must be boolean/u,
    ],
    [
      value => (value.capabilities[0].ownerRemediation = null),
      /ownerRemediation/u,
    ],
    [
      value => (value.capabilities[0].ownerRemediation.refs = []),
      /ownerRemediation.refs/u,
    ],
    [
      value => (value.capabilities[0].evidence = null),
      /evidence must be an array/u,
    ],
    [value => (value.capabilities[0].evidence = [{}]), /evidence\[0\].kind/u],
    [
      value => (value.capabilities[0].evidence = [null]),
      /evidence\[0\] must be/u,
    ],
    [value => (value.auditedAt = 'not-a-date'), /auditedAt/u],
    [
      value => (value.capabilities[0].lastVerified = 'not-a-date'),
      /lastVerified/u,
    ],
    [
      value => (value.capabilities[0].invalidationCondition = ''),
      /invalidationCondition/u,
    ],
    [value => (value.capabilities[0].probe = null), /probe must be an object/u],
    [
      value => (value.capabilities[0].probe.id = '../unsafe'),
      /safe file identifier/u,
    ],
    [value => (value.capabilities[0].probe.version = ''), /probe.version/u],
    [value => (value.capabilities[0].probe.fixture = ''), /probe.fixture/u],
    [
      value => (value.capabilities[0].probe.expectedState = ''),
      /expectedState/u,
    ],
    [
      value => (value.capabilities[0].probe.requiresRuntimeReceipt = false),
      /requiresRuntimeReceipt/u,
    ],
    [
      value => (value.capabilities[0].probe.sourceAssertions = []),
      /sourceAssertions/u,
    ],
    [
      value => (value.capabilities[0].probe.sourceAssertions = [null]),
      /sourceAssertions\[0\]/u,
    ],
    [
      value => (value.capabilities[0].probe.sourceAssertions[0].kind = 'shell'),
      /kind is invalid/u,
    ],
    [
      value =>
        (value.capabilities[0].probe.sourceAssertions[0].path = '/tmp/escape'),
      /must stay inside/u,
    ],
    [
      value =>
        (value.capabilities[0].probe.sourceAssertions[0].path = '../escape'),
      /must stay inside/u,
    ],
    [
      value => (value.capabilities[0].probe.sourceAssertions[0].value = ''),
      /value must be/u,
    ],
  ];

  for (const [mutate, pattern] of cases) {
    const value = registry();
    const result = mutate(value);
    assert.throws(
      () => validateRegistry(result === 'replace-root' ? null : value),
      pattern
    );
  }
});

test('report validation rejects official-looking malformed artifacts', () => {
  const valid = reportArtifact([evaluationReceipt('passing-probe', 'passed')]);
  assert.equal(validateReport(valid), valid);
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    [() => null, /report must be an object/u],
    [{ ...valid, schema: RECEIPT_SCHEMA }, /report.schema/u],
    [{ ...valid, registrySchema: 'wrong' }, /report.registrySchema/u],
    [{ ...valid, certificationContract: '' }, /certificationContract/u],
    [{ ...valid, registryVersion: '' }, /registryVersion/u],
    [{ ...valid, registryDigest: 'not-a-digest' }, /SHA-256 digest/u],
    [
      { ...valid, attestationKeyFingerprint: 'not-a-digest' },
      /attestationKeyFingerprint/u,
    ],
    [{ ...valid, issue: '' }, /report.issue/u],
    [{ ...valid, environment: '' }, /report.environment/u],
    [{ ...valid, environmentVersion: '' }, /report.environmentVersion/u],
    [{ ...valid, sourceVersion: 'main' }, /report.sourceVersion/u],
    [{ ...valid, generatedAt: 'invalid' }, /generatedAt/u],
    [{ ...valid, attestationKeyFingerprint: null }, /passing report receipts/u],
    [{ ...valid, commissioned: 'yes' }, /commissioned must be boolean/u],
    [{ ...valid, summary: null }, /summary must be an object/u],
    [{ ...valid, receipts: null }, /receipts must be a non-empty array/u],
    [{ ...valid, receipts: [null] }, /report.receipts\[0\] must be an object/u],
    [
      { ...valid, summary: { ...valid.summary, certified: 0 } },
      /summary does not match/u,
    ],
    [
      {
        ...valid,
        receipts: [{ ...valid.receipts[0], failureArtifact: { blockers: [] } }],
      },
      /passing state/u,
    ],
    [
      {
        ...valid,
        receipts: [{ ...valid.receipts[0], schema: RECEIPT_SCHEMA }],
      },
      /report.receipts\[0\].schema/u,
    ],
  ];
  for (const [reportOrFactory, pattern] of cases) {
    const report =
      typeof reportOrFactory === 'function'
        ? reportOrFactory()
        : reportOrFactory;
    assert.throws(() => validateReport(report), pattern);
  }

  /** @type {Array<[string, unknown, RegExp]>} */
  const receiptCases = [
    ['probeVersion', '', /probeVersion/u],
    ['capabilityId', '', /capabilityId/u],
    ['critical', 'yes', /critical must be boolean/u],
    ['fixture', '', /fixture/u],
    ['expectedState', '', /expectedState/u],
    ['actualState', '', /actualState/u],
    ['correlationId', 'unsafe', /correlationId/u],
    ['environment', '', /environment/u],
    ['environmentVersion', '', /environmentVersion/u],
    ['sourceVersion', 'main', /sourceVersion/u],
    ['startedAt', 'invalid', /startedAt/u],
    ['completedAt', 'invalid', /completedAt/u],
    ['latencyMs', -1, /latencyMs/u],
    ['outcome', 'unknown', /outcome must be passed or failed/u],
    ['sourceAssertions', null, /sourceAssertions must be an array/u],
    ['runtimeReceiptPath', 42, /runtimeReceiptPath/u],
    ['runtimeReceiptCorrelationId', 'unsafe', /runtimeReceiptCorrelationId/u],
  ];
  for (const [field, value, pattern] of receiptCases) {
    const report = structuredClone(valid);
    report.receipts[0][field] = value;
    assert.throws(() => validateReport(report), pattern);
  }

  const reversed = structuredClone(valid);
  reversed.receipts[0].startedAt = '2026-09-01T00:00:01.000Z';
  assert.throws(() => validateReport(reversed), /must not precede/u);

  const assertion = {
    kind: 'file_exists',
    path: 'fixture.txt',
    expected: 'file exists',
    actual: 'file exists',
    passed: true,
  };
  /** @type {Array<[any, RegExp]>} */
  const assertionCases = [
    [null, /sourceAssertions\[0\] must be an object/u],
    [{ ...assertion, kind: '' }, /sourceAssertions\[0\].kind/u],
    [{ ...assertion, kind: 'shell' }, /kind is invalid/u],
    [{ ...assertion, path: '../escape' }, /must stay inside/u],
    [{ ...assertion, expected: '' }, /expected/u],
    [{ ...assertion, actual: '' }, /actual/u],
    [{ ...assertion, passed: 'yes' }, /passed must be boolean/u],
  ];
  for (const [invalidAssertion, pattern] of assertionCases) {
    const report = structuredClone(valid);
    report.receipts[0].sourceAssertions = [invalidAssertion];
    assert.throws(() => validateReport(report), pattern);
  }

  for (const sourceAssertions of [[], [{ ...assertion, passed: false }]]) {
    const report = structuredClone(valid);
    report.receipts[0].sourceAssertions = sourceAssertions;
    assert.throws(
      () => validateReport(report),
      /passing state is inconsistent/u
    );
  }
  for (const [field, value] of [
    ['runtimeReceiptPath', null],
    ['runtimeReceiptCorrelationId', null],
  ]) {
    const report = structuredClone(valid);
    report.receipts[0][field] = value;
    assert.throws(
      () => validateReport(report),
      /passing state is inconsistent/u
    );
  }

  const withoutArtifact = reportArtifact([evaluationReceipt('failed-probe')]);
  withoutArtifact.receipts[0].failureArtifact = null;
  assert.throws(
    () => validateReport(withoutArtifact),
    /needs a failure artifact/u
  );
  const failedCertified = reportArtifact([evaluationReceipt('failed-probe')]);
  failedCertified.receipts[0].actualState = 'certified';
  failedCertified.summary.certified = 1;
  assert.throws(
    () => validateReport(failedCertified),
    /failed state is inconsistent/u
  );
  const withoutBlockers = reportArtifact([evaluationReceipt('failed-probe')]);
  delete withoutBlockers.receipts[0].failureArtifact.blockers;
  assert.throws(
    () => validateReport(withoutBlockers),
    /failureArtifact.blockers/u
  );
  const emptyBlocker = reportArtifact([evaluationReceipt('failed-probe')]);
  emptyBlocker.receipts[0].failureArtifact.blockers = [''];
  assert.throws(
    () => validateReport(emptyBlocker),
    /failureArtifact.blockers\[0\]/u
  );

  /** @type {Array<[string, unknown, RegExp]>} */
  const failureArtifactCases = [
    ['capabilityId', 'wrong', /capabilityId mismatch/u],
    ['implementationState', 'unknown', /implementationState is invalid/u],
    ['auditedStatus', 'green', /auditedStatus is invalid/u],
    ['ownerRemediation', null, /ownerRemediation must be an object/u],
  ];
  for (const [field, value, pattern] of failureArtifactCases) {
    const report = reportArtifact([evaluationReceipt('failed-probe')]);
    report.receipts[0].failureArtifact[field] = value;
    assert.throws(() => validateReport(report), pattern);
  }

  const duplicates = reportArtifact([
    evaluationReceipt('same-probe', 'passed'),
    {
      ...evaluationReceipt('other-probe', 'passed'),
      capabilityId: 'CAP-same-probe',
    },
  ]);
  assert.throws(
    () => validateReport(duplicates),
    /identifiers must be unique/u
  );
  const wrongEnvironment = structuredClone(valid);
  wrongEnvironment.receipts[0].environment = 'other';
  assert.throws(
    () => validateReport(wrongEnvironment),
    /receipt environment mismatch/u
  );
  const wrongSource = structuredClone(valid);
  wrongSource.receipts[0].sourceVersion = 'f'.repeat(40);
  assert.throws(
    () => validateReport(wrongSource),
    /receipt environment mismatch/u
  );
});

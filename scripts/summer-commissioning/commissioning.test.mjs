import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, link, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const commissioningModule = await import('./commissioning.mjs');

const {
  RECEIPT_SCHEMA,
  EVALUATION_RECEIPT_SCHEMA,
  REGISTRY_SCHEMA,
  REPORT_SCHEMA,
  loadRegistry,
  parseArguments,
  receiptAttestationPayload,
  registryDigest,
  runCommissioning,
  runCli,
  writeReport,
} = commissioningModule;

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const publicKeyFingerprint = createHash('sha256')
  .update(publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex');
const verificationNow = '2026-09-01T00:05:00.000Z';
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
    trustedAttestationKeyFingerprints: [publicKeyFingerprint],
    auditedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshot: {
      repository: 'JovieInc/Jovie',
      ref: 'origin/main',
      sha: sourceVersion,
    },
    capabilities,
  };
}

function runtimeReceipt(overrides = {}, registryValue = registry()) {
  /** @type {any} */
  const receipt = {
    schema: RECEIPT_SCHEMA,
    probeId: 'summer.synthetic.round-trip',
    probeVersion: '1.0.0',
    fixture: 'synthetic-fixture/v1',
    expectedState: 'round_trip_observed',
    actualState: 'round_trip_observed',
    correlationId: 'summer-test:correlation-0001',
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    registryDigest: registryDigest(registryValue),
    startedAt: '2026-09-01T00:00:00.000Z',
    completedAt: '2026-09-01T00:00:00.010Z',
    latencyMs: 10,
    outcome: 'passed',
    evidence: [
      {
        kind: 'artifact',
        ref: 'artifact://synthetic/runtime-receipt-0001',
        sha256: 'b'.repeat(64),
      },
    ],
    failureArtifact: null,
    ...overrides,
  };
  receipt.attestation = {
    algorithm: 'ed25519',
    signature: sign(
      null,
      Buffer.from(receiptAttestationPayload(receipt)),
      privateKey
    ).toString('base64'),
  };
  return receipt;
}

function commissioningOptions(repositoryRoot, overrides = {}) {
  return {
    repositoryRoot,
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    attestationPublicKey: publicKeyPem,
    now: verificationNow,
    allowTestRegistry: true,
    ...overrides,
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
        latencyMs: 0,
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
    attestationKeyFingerprint: publicKeyFingerprint,
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

async function fixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'summer-commissioning-'));
  writeFileSync(join(directory, 'fixture.txt'), 'canonical\n');
  return directory;
}

test('fails closed when a runtime receipt is missing', async t => {
  const repositoryRoot = await fixtureDirectory();
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const report = runCommissioning(
    registry(),
    commissioningOptions(repositoryRoot)
  );

  assert.equal(report.commissioned, false);
  assert.equal(report.summary.blocking, 1);
  assert.equal(report.receipts[0].actualState, 'passing');
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /runtime receipt missing/u
  );
});

test('does not let an audited certified label replace current evidence', async t => {
  const repositoryRoot = await fixtureDirectory();
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const report = runCommissioning(
    registry([capability({ status: 'certified' })]),
    commissioningOptions(repositoryRoot)
  );

  assert.equal(report.commissioned, false);
  assert.equal(report.receipts[0].outcome, 'failed');
});

test('certifies only when source assertions and the exact runtime receipt pass', async t => {
  const repositoryRoot = await fixtureDirectory();
  const registryValue = registry();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  mkdirSync(evidenceDirectory);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    JSON.stringify(runtimeReceipt({}, registryValue))
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));

  const report = runCommissioning(
    registryValue,
    commissioningOptions(repositoryRoot, { evidenceDirectory })
  );

  assert.equal(report.commissioned, true);
  assert.equal(report.summary.certified, 1);
  assert.equal(report.receipts[0].actualState, 'certified');
  assert.equal(report.receipts[0].outcome, 'passed');
  assert.equal(report.receipts[0].failureArtifact, null);
});

test('rejects stale environment-version receipts', async t => {
  const repositoryRoot = await fixtureDirectory();
  const registryValue = registry();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  mkdirSync(evidenceDirectory);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    JSON.stringify(
      runtimeReceipt({ environmentVersion: 'sha-old' }, registryValue)
    )
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));

  const report = runCommissioning(
    registryValue,
    commissioningOptions(repositoryRoot, { evidenceDirectory })
  );

  assert.equal(report.commissioned, false);
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /environmentVersion mismatch/u
  );
});

test('turns a broken source assertion into a failure artifact', async t => {
  const repositoryRoot = await fixtureDirectory();
  const registryValue = registry();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  mkdirSync(evidenceDirectory);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    JSON.stringify(runtimeReceipt({}, registryValue))
  );
  writeFileSync(join(repositoryRoot, 'fixture.txt'), 'wrong\n');
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));

  const report = runCommissioning(
    registryValue,
    commissioningOptions(repositoryRoot, { evidenceDirectory })
  );

  assert.equal(report.commissioned, false);
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /file_contains failed/u
  );
});

test('non-regular source targets become blocker receipts instead of aborting', async t => {
  const repositoryRoot = await fixtureDirectory();
  mkdirSync(join(repositoryRoot, 'not-a-file'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const report = runCommissioning(
    registry([
      capability({
        probe: {
          ...capability().probe,
          sourceAssertions: [
            { kind: 'file_contains', path: 'not-a-file', value: 'marker' },
          ],
        },
      }),
    ]),
    commissioningOptions(repositoryRoot)
  );

  assert.equal(report.commissioned, false);
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /path is not a regular file/u
  );
});

test('supports exists and negative source assertions', async t => {
  const repositoryRoot = await fixtureDirectory();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  mkdirSync(evidenceDirectory);
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const extended = capability({
    probe: {
      ...capability().probe,
      sourceAssertions: [
        { kind: 'file_exists', path: 'fixture.txt' },
        {
          kind: 'file_not_contains',
          path: 'fixture.txt',
          value: 'forbidden',
        },
      ],
    },
  });
  const registryValue = registry([extended]);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    JSON.stringify(runtimeReceipt({}, registryValue))
  );

  const report = runCommissioning(
    registryValue,
    commissioningOptions(repositoryRoot, { evidenceDirectory })
  );

  assert.equal(report.commissioned, true);
  assert.deepEqual(
    report.receipts[0].sourceAssertions.map(assertion => assertion.expected),
    ['file exists', 'marker absent']
  );
});

test('fails a missing file and malformed runtime receipt without throwing', async t => {
  const repositoryRoot = await fixtureDirectory();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  mkdirSync(evidenceDirectory);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    '{invalid'
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const missing = capability({
    probe: {
      ...capability().probe,
      sourceAssertions: [{ kind: 'file_exists', path: 'missing.txt' }],
    },
  });

  const report = runCommissioning(
    registry([missing]),
    commissioningOptions(repositoryRoot, { evidenceDirectory })
  );

  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /file_exists failed/u
  );
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /runtime receipt unreadable/u
  );
});

test('rejects source assertions that escape through a repository symlink', async t => {
  const repositoryRoot = await fixtureDirectory();
  const outsideDirectory = await mkdtemp(
    join(tmpdir(), 'summer-commissioning-outside-')
  );
  writeFileSync(join(outsideDirectory, 'secret.txt'), 'canonical\n');
  await symlink(
    join(outsideDirectory, 'secret.txt'),
    join(repositoryRoot, 'escape.txt')
  );
  t.after(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  });
  const escaped = capability({
    probe: {
      ...capability().probe,
      sourceAssertions: [
        { kind: 'file_contains', path: 'escape.txt', value: 'canonical' },
      ],
    },
  });
  const report = runCommissioning(
    registry([escaped]),
    commissioningOptions(repositoryRoot)
  );
  assert.match(
    report.receipts[0].failureArtifact.blockers.join('\n'),
    /path escapes repository/u
  );
});

test('rejects an environment other than the intended commissioning target', async t => {
  const repositoryRoot = await fixtureDirectory();
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  assert.throws(
    () =>
      runCommissioning(
        registry(),
        commissioningOptions(repositoryRoot, { environment: 'local' })
      ),
    /does not match intended production-like/u
  );
  assert.throws(
    () =>
      runCommissioning(
        registry(),
        commissioningOptions(repositoryRoot, { now: 'invalid' })
      ),
    /options.now must be a valid date/u
  );
});

test('noncritical red evidence does not block critical commissioning', async t => {
  const repositoryRoot = await fixtureDirectory();
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const report = runCommissioning(
    registry([capability({ critical: false, status: 'blocked' })]),
    commissioningOptions(repositoryRoot)
  );
  assert.equal(report.commissioned, true);
  assert.equal(report.summary.certified, 0);
  assert.equal(report.summary.blocking, 0);
});

test('CLI plumbing loads registries, writes artifacts, and validates arguments', async t => {
  const repositoryRoot = await fixtureDirectory();
  const registryValue = registry();
  const evidenceDirectory = join(repositoryRoot, 'evidence');
  const outputDirectory = join(repositoryRoot, 'output');
  const registryPath = join(repositoryRoot, 'registry.json');
  const publicKeyPath = join(repositoryRoot, 'attestation-public-key.pem');
  mkdirSync(evidenceDirectory);
  writeFileSync(registryPath, JSON.stringify(registryValue));
  writeFileSync(publicKeyPath, publicKeyPem);
  writeFileSync(
    join(evidenceDirectory, 'summer.synthetic.round-trip.json'),
    JSON.stringify(runtimeReceipt({}, registryValue))
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  let stdout = '';
  const sink = { write: value => (stdout += value) };

  const report = await runCli(
    [
      '--environment',
      'production-like',
      '--environment-version',
      'sha-test',
      '--attestation-public-key',
      publicKeyPath,
      '--evidence-dir',
      evidenceDirectory,
      '--output-dir',
      outputDirectory,
    ],
    {
      repositoryRoot,
      stdout: sink,
      registryPath,
      allowTestRegistry: true,
      now: verificationNow,
    }
  );

  assert.equal(report.commissioned, true);
  assert.equal(JSON.parse(stdout).commissioned, true);
  assert.equal(loadRegistry(registryPath).registryVersion, 'test-v1');
  assert.equal(existsSync(join(outputDirectory, 'report.json')), true);
  assert.equal(
    existsSync(join(outputDirectory, 'summer.synthetic.round-trip.json')),
    true
  );
  assert.equal(
    JSON.parse(readFileSync(join(outputDirectory, 'report.json'), 'utf8'))
      .commissioned,
    true
  );

  let defaultOutput = '';
  await runCli(
    ['--environment-version', 'sha-test', '--evidence-dir', evidenceDirectory],
    {
      repositoryRoot,
      stdout: { write: value => (defaultOutput += value) },
      registryPath,
      allowTestRegistry: true,
      attestationPublicKey: publicKeyPem,
      now: verificationNow,
    }
  );
  assert.equal(JSON.parse(defaultOutput).commissioned, true);
  const { publicKey: untrustedPublicKey } = generateKeyPairSync('ed25519');
  const untrustedKeyPath = join(repositoryRoot, 'untrusted-public-key.pem');
  writeFileSync(
    untrustedKeyPath,
    untrustedPublicKey.export({ type: 'spki', format: 'pem' })
  );
  await assert.rejects(
    runCli(
      [
        '--environment-version',
        'sha-test',
        '--attestation-public-key',
        untrustedKeyPath,
      ],
      {
        repositoryRoot,
        stdout: sink,
        registryPath,
        allowTestRegistry: true,
      }
    ),
    /fingerprint is not trusted/u
  );
  await assert.rejects(
    runCli(
      [
        '--environment-version',
        'sha-test',
        '--evidence-dir',
        evidenceDirectory,
        '--output-dir',
        evidenceDirectory,
      ],
      {
        repositoryRoot,
        stdout: sink,
        registryPath,
        allowTestRegistry: true,
      }
    ),
    /evidence and output directories must not overlap/u
  );
  const evidenceAlias = join(repositoryRoot, 'evidence-alias');
  await symlink(evidenceDirectory, evidenceAlias);
  await assert.rejects(
    runCli(
      [
        '--environment-version',
        'sha-test',
        '--evidence-dir',
        evidenceDirectory,
        '--output-dir',
        join(evidenceAlias, 'nested-output'),
      ],
      {
        repositoryRoot,
        stdout: sink,
        registryPath,
        allowTestRegistry: true,
      }
    ),
    /evidence and output directories must not overlap/u
  );
  assert.deepEqual(parseArguments(['--environment', 'test']), {
    environment: 'test',
  });
  assert.throws(() => parseArguments(['--one', 'two']), /unknown argument/u);
  assert.throws(() => parseArguments(['positional']), /unknown argument/u);
  assert.throws(
    () => parseArguments(['--registry', registryPath]),
    /unknown argument/u
  );
  await assert.rejects(
    runCli(['--environment-version', 'sha-test'], {
      repositoryRoot,
      registryPath,
      stdout: sink,
    }),
    /canonical commissioning registry capability set mismatch/u
  );
  await assert.rejects(
    runCli([], {
      repositoryRoot,
      stdout: sink,
      registryPath,
      allowTestRegistry: true,
    }),
    /--environment-version must be a non-empty string/u
  );
});

test('report writer emits failure artifacts only for failed probes', async t => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), 'summer-commissioning-output-')
  );
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));
  await writeReport(
    reportArtifact([
      evaluationReceipt('passing-probe', 'passed'),
      evaluationReceipt('failing-probe'),
    ]),
    outputDirectory
  );
  assert.equal(
    existsSync(join(outputDirectory, 'failures', 'passing-probe.json')),
    false
  );
  assert.equal(
    existsSync(join(outputDirectory, 'failures', 'failing-probe.json')),
    true
  );
  await writeReport(
    reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
    outputDirectory
  );
  assert.equal(existsSync(join(outputDirectory, 'failing-probe.json')), false);
  assert.equal(
    existsSync(join(outputDirectory, 'failures', 'failing-probe.json')),
    false
  );
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('../escape', 'passed')]),
      outputDirectory
    ),
    /probeId must be a safe file identifier/u
  );
  await assert.rejects(
    writeReport(reportArtifact([]), outputDirectory),
    /report receipts must be a non-empty array/u
  );
  await assert.rejects(
    writeReport(
      reportArtifact([
        evaluationReceipt('duplicate-probe', 'passed'),
        {
          ...evaluationReceipt('duplicate-probe', 'passed'),
          capabilityId: 'CAP-duplicate-probe-2',
        },
      ]),
      outputDirectory
    ),
    /receipt identifiers must be unique/u
  );
  const outsideDirectory = await mkdtemp(
    join(tmpdir(), 'summer-commissioning-report-outside-')
  );
  t.after(() => rm(outsideDirectory, { recursive: true, force: true }));
  await rm(join(outputDirectory, 'failures'), { recursive: true, force: true });
  await symlink(outsideDirectory, join(outputDirectory, 'failures'));
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
      outputDirectory
    ),
    /failure artifact directory must stay inside output directory/u
  );
  await rm(join(outputDirectory, 'failures'), { force: true });
  mkdirSync(join(outputDirectory, 'failures'));
  await rm(join(outputDirectory, 'report.json'), { force: true });
  const externalReport = join(outsideDirectory, 'report.json');
  writeFileSync(externalReport, '{}');
  await symlink(externalReport, join(outputDirectory, 'report.json'));
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
      outputDirectory
    ),
    /existing report must be a private regular file/u
  );
  await rm(join(outputDirectory, 'report.json'), { force: true });
  writeFileSync(join(outputDirectory, 'report.json'), '{"receipts":null}');
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
      outputDirectory
    ),
    /existing report receipts must be an array/u
  );
  await rm(join(outputDirectory, 'report.json'), { force: true });
  const hardLinkTarget = join(outsideDirectory, 'hard-link-report.json');
  writeFileSync(hardLinkTarget, JSON.stringify({ receipts: [] }));
  await link(hardLinkTarget, join(outputDirectory, 'report.json'));
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
      outputDirectory
    ),
    /existing report must be a private regular file/u
  );
  await rm(join(outputDirectory, 'report.json'), { force: true });
  await chmod(outputDirectory, 0o755);
  await assert.rejects(
    writeReport(
      reportArtifact([evaluationReceipt('passing-probe', 'passed')]),
      outputDirectory
    ),
    /output directory must be private/u
  );
});

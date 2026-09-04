import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadRegistry,
  REGISTRY_SCHEMA,
  registryDigest,
  runCommissioning,
  validateRuntimeReceipt,
} from './commissioning.mjs';

const canonicalRegistryPath = fileURLToPath(
  new URL('./registry.json', import.meta.url)
);
const canonicalRepositoryRoot = fileURLToPath(
  new URL('../..', import.meta.url)
);
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
    trustedAttestationKeyFingerprints: [],
    auditedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshot: {
      repository: 'JovieInc/Jovie',
      ref: 'origin/main',
      sha: sourceVersion,
    },
    capabilities,
  };
}

function commissioningOptions(repositoryRoot) {
  return {
    repositoryRoot,
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    attestationPublicKey: null,
    now: '2026-09-01T00:05:00.000Z',
    allowTestRegistry: true,
  };
}

async function fixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'summer-commissioning-'));
  writeFileSync(join(directory, 'fixture.txt'), 'canonical\n');
  return directory;
}

test('direct commissioning rejects a noncanonical false-green registry', async t => {
  const repositoryRoot = await fixtureDirectory();
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  assert.throws(
    () =>
      runCommissioning(
        registry([capability({ critical: false, status: 'blocked' })]),
        { ...commissioningOptions(repositoryRoot), allowTestRegistry: false }
      ),
    /canonical commissioning registry capability set mismatch/u
  );
});

test('canonical-shaped registry substitutions cannot replace probe definitions', () => {
  const substituted = loadRegistry(canonicalRegistryPath);
  substituted.sourceSnapshot.sha = '0'.repeat(40);
  for (const item of substituted.capabilities) {
    item.probe.sourceAssertions = [
      { kind: 'file_exists', path: 'fixture.txt' },
    ];
  }
  assert.throws(
    () =>
      runCommissioning(substituted, {
        ...commissioningOptions(canonicalRepositoryRoot),
        allowTestRegistry: false,
      }),
    /registry does not match the canonical file|commissioning requires a clean repository/u
  );
});

test('completed empty heartbeat turns fail the canonical recurrence probe', () => {
  const canonicalRegistry = loadRegistry(canonicalRegistryPath);
  const heartbeat = canonicalRegistry.capabilities.find(
    item => item.id === 'SUMMER-COMM-011'
  );
  assert.equal(heartbeat.probe.version, '1.1.0');
  assert.equal(
    heartbeat.probe.fixture,
    'scheduled-heartbeat-nonempty-receipt-across-restart/v2'
  );
  assert.equal(
    heartbeat.probe.expectedState,
    'eve_owned_non_empty_terminal_noop_or_remediation_receipt'
  );

  const errors = validateRuntimeReceipt(
    {
      schema: 'jovie.summer-commissioning.probe-receipt/v1',
      probeId: heartbeat.probe.id,
      probeVersion: heartbeat.probe.version,
      fixture: heartbeat.probe.fixture,
      expectedState: heartbeat.probe.expectedState,
      actualState: 'completed_empty_turn',
      correlationId: 'summer-heartbeat:empty-turn-0001',
      environment: 'production-like',
      environmentVersion: 'sha-test',
      sourceVersion,
      registryDigest: registryDigest(canonicalRegistry),
      startedAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-01T00:00:00.010Z',
      latencyMs: 10,
      outcome: 'passed',
      evidence: [
        {
          kind: 'artifact',
          ref: 'artifact://heartbeat/empty-turn',
          sha256: 'b'.repeat(64),
        },
      ],
      failureArtifact: null,
      attestation: null,
    },
    heartbeat,
    {
      environment: 'production-like',
      environmentVersion: 'sha-test',
      sourceVersion,
      registryDigest: registryDigest(canonicalRegistry),
      nowMs: Date.parse('2026-09-01T00:05:00.000Z'),
      attestationPublicKey: null,
    }
  );
  assert.match(
    errors.join('\n'),
    /actualState does not satisfy expectedState/u
  );
});

test('production provenance ignores hostile Git repository overrides', () => {
  const expectedSourceVersion = execFileSync(
    '/usr/bin/git',
    ['rev-parse', 'HEAD'],
    { cwd: canonicalRepositoryRoot, encoding: 'utf8' }
  ).trim();
  const previousGitDirectory = process.env.GIT_DIR;
  process.env.GIT_DIR = '/tmp/jovie-hostile-git-does-not-exist';
  try {
    try {
      const report = runCommissioning(loadRegistry(canonicalRegistryPath), {
        repositoryRoot: canonicalRepositoryRoot,
        environment: 'production-like',
        environmentVersion: 'hostile-git-environment-test',
        attestationPublicKey: null,
        now: '2026-09-01T00:05:00.000Z',
      });
      assert.equal(report.sourceVersion, expectedSourceVersion);
      assert.equal(report.commissioned, false);
    } catch (error) {
      assert.match(error.message, /commissioning requires a clean repository/u);
    }
  } finally {
    if (previousGitDirectory === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDirectory;
  }
});

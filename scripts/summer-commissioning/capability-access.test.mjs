import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ACCESS_REGISTRY_SCHEMA,
  REQUIRED_ACCESS_CAPABILITY_IDS,
  validateAccessRegistry,
  validateAccessRegistryBindings,
  validateAccessRuntimeReceipt,
} from './capability-access.mjs';
import {
  digestCanonicalJson,
  RECEIPT_SCHEMA,
  receiptAttestationPayload,
} from './receipt-trust.mjs';

const sourceVersion = '53813e6ada1f0c229f67c366426105ad22553382';
const safeToolManifestDigest = 'a'.repeat(64);
const policyDigest = 'b'.repeat(64);
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

function accessCapability(id, overrides = {}) {
  return {
    id,
    capability: `Synthetic ${id}`,
    accessMode: 'read-only',
    dataBoundary: 'synthetic fixture only',
    hostEvidenceCountsAsSummer: false,
    state: {
      configured: false,
      authenticated: false,
      authorized: false,
      liveProbed: false,
      autonomousSafe: false,
    },
    evidence: [
      { tier: 'gap', ref: 'fixture://access-gap', summary: 'Not ready.' },
    ],
    leastPrivilegePacket: {
      status: 'missing',
      owner: 'Summer',
      grants: ['read synthetic fixture'],
      explicitDenials: ['mutation'],
      reEvaluateWhen: 'a signed fixture receipt exists',
    },
    deterministicProbe: {
      id: `summer.access.${id.replace('summer-access-', '')}`,
      version: '1.0.0',
      fixture: `${id}/v1`,
      expectedState:
        'configured_authenticated_authorized_live_probed_autonomous_safe',
      requiresSummerPrincipal: true,
      forbidsHostSubstitution: true,
      requiresAttestedReceipt: true,
    },
    blocker: 'Missing.',
    ...overrides,
  };
}

function accessRegistry() {
  return {
    schema: ACCESS_REGISTRY_SCHEMA,
    auditVersion: 'test-v1',
    issue: 'JOV-5853',
    auditedAt: '2026-09-02T04:11:01Z',
    sourceVersion,
    principal: {
      id: 'summer',
      channel: 'ovie',
      safeToolManifestDigest,
      policyDigest,
    },
    capabilities: REQUIRED_ACCESS_CAPABILITY_IDS.map(id =>
      accessCapability(id)
    ),
  };
}

function readyCapability() {
  return accessCapability('summer-access-gbrain', {
    state: {
      configured: true,
      authenticated: true,
      authorized: true,
      liveProbed: true,
      autonomousSafe: true,
    },
    leastPrivilegePacket: {
      status: 'existing',
      owner: 'Summer',
      grants: ['read synthetic fixture'],
      explicitDenials: ['mutation'],
      reEvaluateWhen: 'the principal, policy, or fixture changes',
    },
    blocker: null,
  });
}

function signedReceipt(capability, accessClaim = {}) {
  const registryDigest = digestCanonicalJson(accessRegistry());
  const receipt = {
    schema: RECEIPT_SCHEMA,
    probeId: capability.deterministicProbe.id,
    probeVersion: capability.deterministicProbe.version,
    fixture: capability.deterministicProbe.fixture,
    expectedState: capability.deterministicProbe.expectedState,
    actualState: capability.deterministicProbe.expectedState,
    correlationId: 'summer-access:test-0001',
    environment: 'production-like',
    environmentVersion: 'deploy-test',
    sourceVersion,
    registryDigest,
    startedAt: '2026-09-02T04:10:00Z',
    completedAt: '2026-09-02T04:10:01Z',
    latencyMs: 1000,
    outcome: 'passed',
    evidence: [
      {
        kind: 'artifact',
        ref: 'artifact://summer-access/synthetic-0001',
        sha256: 'c'.repeat(64),
      },
    ],
    failureArtifact: null,
    accessClaim: {
      principal: 'summer',
      safeToolManifestDigest,
      policyDigest,
      configured: true,
      authenticated: true,
      authorized: true,
      liveProbed: true,
      autonomousSafe: true,
      hostEvidenceUsed: false,
      ...accessClaim,
    },
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

function receiptContext() {
  return {
    environment: 'production-like',
    environmentVersion: 'deploy-test',
    sourceVersion,
    registryDigest: digestCanonicalJson(accessRegistry()),
    nowMs: Date.parse('2026-09-02T04:10:02Z'),
    attestationPublicKey: publicKey,
    safeToolManifestDigest,
    policyDigest,
  };
}

test('validates the exact seven-capability access audit', () => {
  assert.equal(validateAccessRegistry(accessRegistry()).capabilities.length, 7);
  const missing = accessRegistry();
  missing.capabilities.pop();
  assert.throws(() => validateAccessRegistry(missing), /exact required IDs/u);
});

test('binds the canonical registry to the current Summer manifest and policy', () => {
  const registry = validateAccessRegistry(
    JSON.parse(
      readFileSync(
        new URL('./capability-access-registry.json', import.meta.url),
        'utf8'
      )
    )
  );
  assert.equal(
    validateAccessRegistryBindings(
      registry,
      new URL('../..', import.meta.url).pathname
    ),
    registry
  );
  registry.principal.policyDigest = 'f'.repeat(64);
  assert.throws(
    () =>
      validateAccessRegistryBindings(
        registry,
        new URL('../..', import.meta.url).pathname
      ),
    /policyDigest is stale/u
  );
});

test('host evidence can never count as Summer evidence', () => {
  const registry = accessRegistry();
  registry.capabilities[0].evidence = [
    {
      tier: 'host',
      ref: 'host-probe://synthetic',
      summary: 'Host only.',
      countsForSummer: true,
    },
  ];
  assert.throws(
    () => validateAccessRegistry(registry),
    /countsForSummer must be false/u
  );
  registry.capabilities[0].hostEvidenceCountsAsSummer = true;
  assert.throws(
    () => validateAccessRegistry(registry),
    /hostEvidenceCountsAsSummer must be false/u
  );
});

test('autonomous safety requires every gate and an existing packet', () => {
  for (const gate of [
    'configured',
    'authenticated',
    'authorized',
    'liveProbed',
  ]) {
    const registry = accessRegistry();
    const capability = readyCapability();
    capability.state[gate] = false;
    registry.capabilities[0] = capability;
    assert.throws(
      () => validateAccessRegistry(registry),
      /autonomousSafe requires|liveProbed requires|authenticated requires configured/u
    );
  }

  const registry = accessRegistry();
  const capability = readyCapability();
  capability.leastPrivilegePacket.status = 'partial';
  registry.capabilities[0] = capability;
  assert.throws(
    () => validateAccessRegistry(registry),
    /autonomousSafe requires/u
  );
});

test('accepts only an attested exact-Summer access receipt', () => {
  const capability = readyCapability();
  assert.deepEqual(
    validateAccessRuntimeReceipt(
      signedReceipt(capability),
      { ...capability, probe: capability.deterministicProbe },
      receiptContext()
    ),
    []
  );

  const hostSubstitution = signedReceipt(capability, {
    principal: 'host-user',
    hostEvidenceUsed: true,
    authenticated: false,
  });
  assert.match(
    validateAccessRuntimeReceipt(
      hostSubstitution,
      { ...capability, probe: capability.deterministicProbe },
      receiptContext()
    ).join('\n'),
    /principal must be summer|authenticated must be true|hostEvidenceUsed must be false/u
  );
});

test('rejects access receipts for incomplete permission packets', () => {
  const capability = accessCapability('summer-access-gbrain');
  assert.match(
    validateAccessRuntimeReceipt(
      signedReceipt(capability),
      { ...capability, probe: capability.deterministicProbe },
      receiptContext()
    ).join('\n'),
    /least-privilege packet is not existing/u
  );
});

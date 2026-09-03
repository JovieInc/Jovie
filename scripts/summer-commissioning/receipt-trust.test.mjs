import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  digestCanonicalJson,
  RECEIPT_SCHEMA,
  receiptAttestationPayload,
  validateRuntimeReceipt,
} from './receipt-trust.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const verificationNow = '2026-09-01T00:05:00.000Z';
const sourceVersion = '6599a876fde20da8482f4280c79e82889de391e9';

function capability() {
  return {
    probe: {
      id: 'summer.synthetic.round-trip',
      version: '1.0.0',
      fixture: 'synthetic-fixture/v1',
      expectedState: 'round_trip_observed',
    },
  };
}

function registry() {
  return {
    schema: 'jovie.summer-commissioning.registry/v1',
    issue: 'JOV-5853',
    capabilities: [capability()],
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
    registryDigest: digestCanonicalJson(registryValue),
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

function validationContext(registryValue = registry()) {
  return {
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion,
    registryDigest: digestCanonicalJson(registryValue),
    nowMs: Date.parse(verificationNow),
    attestationPublicKey: publicKey,
  };
}

test('reports every invalid runtime-receipt field in one artifact', () => {
  assert.deepEqual(validateRuntimeReceipt(null, capability(), {}), [
    'runtime receipt must be an object',
  ]);
  assert.deepEqual(
    validateRuntimeReceipt({}, capability(), validationContext()),
    [
      'receipt schema mismatch',
      'probeId mismatch',
      'probeVersion mismatch',
      'environment mismatch',
      'environmentVersion mismatch',
      'sourceVersion mismatch',
      'registryDigest mismatch',
      'fixture mismatch',
      'expectedState mismatch',
      'actualState does not satisfy expectedState',
      'outcome is not passed',
      'correlationId is missing or unsafe',
      'latencyMs must be a non-negative number',
      'startedAt and completedAt must be canonical UTC ISO timestamps',
      'evidence must be a non-empty array',
      'passing receipt failureArtifact must be null',
      'attestation must be an object',
    ]
  );
});

test('rejects runtime receipts whose completion predates their start', () => {
  const errors = validateRuntimeReceipt(
    runtimeReceipt({
      startedAt: '2026-09-01T00:00:01.000Z',
      completedAt: '2026-09-01T00:00:00.000Z',
    }),
    capability(),
    validationContext()
  );
  assert.deepEqual(errors, ['completedAt must not precede startedAt']);
});

test('rejects noncanonical runtime receipt timestamps', () => {
  const receipt = runtimeReceipt({
    startedAt: 'September 1, 2026 00:00:00 UTC',
  });
  assert.match(
    validateRuntimeReceipt(receipt, capability(), validationContext()).join(
      '\n'
    ),
    /canonical UTC ISO timestamps/u
  );
});

test('rejects forged, stale, unsafe, and untrusted runtime receipts', () => {
  const registryValue = registry();
  const baseContext = validationContext(registryValue);
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    [
      { ...runtimeReceipt({}, registryValue), registryDigest: 'b'.repeat(64) },
      /registryDigest mismatch|attestation signature invalid/u,
    ],
    [
      runtimeReceipt(
        {
          startedAt: '2026-08-31T23:40:00.000Z',
          completedAt: '2026-08-31T23:40:01.000Z',
        },
        registryValue
      ),
      /outside the freshness window/u,
    ],
    [
      runtimeReceipt(
        {
          startedAt: '2026-09-01T00:07:00.000Z',
          completedAt: '2026-09-01T00:07:01.000Z',
        },
        registryValue
      ),
      /outside the freshness window/u,
    ],
    [
      {
        ...runtimeReceipt({}, registryValue),
        attestation: { algorithm: 'hmac-sha256', signature: 'invalid' },
      },
      /algorithm must be ed25519/u,
    ],
    [
      runtimeReceipt({ evidence: ['x'] }, registryValue),
      /durable ref, and SHA-256 digest/u,
    ],
    [
      runtimeReceipt({ sourceVersion: 'f'.repeat(40) }, registryValue),
      /sourceVersion mismatch/u,
    ],
    [
      runtimeReceipt(
        {
          evidence: [
            {
              kind: 'artifact',
              ref: 'https://example.com/latest',
              sha256: 'b'.repeat(64),
            },
          ],
        },
        registryValue
      ),
      /durable ref, and SHA-256 digest/u,
    ],
    [
      runtimeReceipt(
        {
          evidence: [
            {
              kind: 'artifact',
              ref: 'artifact://synthetic/runtime-receipt-0001',
            },
          ],
        },
        registryValue
      ),
      /durable ref, and SHA-256 digest/u,
    ],
  ];
  for (const [receipt, pattern] of cases) {
    assert.match(
      validateRuntimeReceipt(receipt, capability(), baseContext).join('\n'),
      pattern
    );
  }

  const tampered = runtimeReceipt({}, registryValue);
  tampered.evidence = [
    {
      kind: 'artifact',
      ref: 'artifact://synthetic/tampered',
      sha256: 'b'.repeat(64),
    },
  ];
  assert.match(
    validateRuntimeReceipt(tampered, capability(), baseContext).join('\n'),
    /attestation signature invalid/u
  );
  assert.match(
    validateRuntimeReceipt(runtimeReceipt({}, registryValue), capability(), {
      ...baseContext,
      attestationPublicKey: null,
    }).join('\n'),
    /trusted attestation public key missing/u
  );
  const { publicKey: wrongPublicKey } = generateKeyPairSync('ed25519');
  assert.match(
    validateRuntimeReceipt(runtimeReceipt({}, registryValue), capability(), {
      ...baseContext,
      attestationPublicKey: wrongPublicKey,
    }).join('\n'),
    /attestation signature invalid/u
  );
  assert.match(
    validateRuntimeReceipt(runtimeReceipt({}, registryValue), capability(), {
      ...baseContext,
      attestationPublicKey: {},
    }).join('\n'),
    /attestation signature invalid/u
  );
});

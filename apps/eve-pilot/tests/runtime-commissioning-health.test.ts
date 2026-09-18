import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CRITICAL_CAPABILITY_COUNT,
  CERTIFICATION_CONTRACT,
  COMMISSIONING_REPORT_SCHEMA,
  RUNTIME_HEALTH_COMMISSIONED,
  RUNTIME_HEALTH_UNCOMMISSIONED,
  resolveRuntimeHealthStatus,
  SUMMER_COMMISSIONING_ISSUE,
  verifySignedCommissioningReceipt,
} from '../agent/lib/runtime-commissioning-health';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({
  type: 'spki',
  format: 'pem',
}) as string;
const publicKeyFingerprint = createHash('sha256')
  .update(publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex');
const otherKey = generateKeyPairSync('ed25519');
const otherPublicKeyPem = otherKey.publicKey.export({
  type: 'spki',
  format: 'pem',
}) as string;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .map(
        key =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function evaluationReceipt(index: number) {
  const probeId = `summer.probe.${String(index + 1).padStart(3, '0')}`;
  return {
    schema: 'jovie.summer-commissioning.evaluation-receipt/v1',
    probeId,
    probeVersion: '1.0.0',
    capabilityId: `SUMMER-COMM-${String(index + 1).padStart(3, '0')}`,
    critical: true,
    fixture: 'fixture/v1',
    expectedState: 'expected',
    actualState: 'certified',
    correlationId: `summer-test:${probeId}`,
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion: 'a'.repeat(40),
    startedAt: '2026-09-17T00:00:00.000Z',
    completedAt: '2026-09-17T00:00:00.010Z',
    latencyMs: 10,
    outcome: 'passed',
    sourceAssertions: [],
    runtimeReceiptPath: `/tmp/${probeId}.json`,
    runtimeReceiptCorrelationId: `summer-runtime:${probeId}`,
    failureArtifact: null,
  };
}

function unsignedReport(
  overrides: Record<string, unknown> = {},
  receiptCount = CANONICAL_CRITICAL_CAPABILITY_COUNT
) {
  const receipts = Array.from({ length: receiptCount }, (_, index) =>
    evaluationReceipt(index)
  );
  return {
    schema: COMMISSIONING_REPORT_SCHEMA,
    registrySchema: 'jovie.summer-commissioning.registry/v1',
    registryVersion: 'test-v1',
    registryDigest: 'a'.repeat(64),
    attestationKeyFingerprint: publicKeyFingerprint,
    certificationContract: CERTIFICATION_CONTRACT,
    issue: SUMMER_COMMISSIONING_ISSUE,
    environment: 'production-like',
    environmentVersion: 'sha-test',
    sourceVersion: 'a'.repeat(40),
    generatedAt: '2026-09-17T00:00:00.010Z',
    commissioned: true,
    summary: {
      capabilities: receiptCount,
      certified: receiptCount,
      blocking: 0,
    },
    receipts,
    ...overrides,
  };
}

function signValue(value: Record<string, unknown>) {
  const { attestation: _attestation, ...payload } = value;
  return {
    ...payload,
    attestation: {
      algorithm: 'ed25519',
      signature: sign(
        null,
        Buffer.from(canonicalJson(payload)),
        privateKey
      ).toString('base64'),
    },
  };
}

describe('runtime commissioning health', () => {
  it('stays uncommissioned without a receipt, key, or summer identity', () => {
    expect(
      resolveRuntimeHealthStatus({ identity: 'summer', environment: {} })
    ).toBe(RUNTIME_HEALTH_UNCOMMISSIONED);
    expect(
      verifySignedCommissioningReceipt(
        signValue(unsignedReport()),
        publicKeyPem,
        'jovie'
      )
    ).toBe(false);
    expect(
      resolveRuntimeHealthStatus({
        identity: 'jovie',
        environment: {
          RUNTIME_COMMISSIONING_RECEIPT: JSON.stringify(
            signValue(unsignedReport())
          ),
          RUNTIME_COMMISSIONING_ATTESTATION_PUBLIC_KEY: publicKeyPem,
        },
      })
    ).toBe(RUNTIME_HEALTH_UNCOMMISSIONED);
  });

  it('reports commissioned only from a verified signed 16-probe harness receipt', () => {
    const receipt = signValue(unsignedReport());
    expect(
      verifySignedCommissioningReceipt(receipt, publicKeyPem, 'summer')
    ).toBe(true);
    expect(
      resolveRuntimeHealthStatus({
        identity: 'summer',
        environment: {
          SUMMER_COMMISSIONING_RECEIPT: JSON.stringify(receipt),
          SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY: publicKeyPem,
        },
      })
    ).toBe(RUNTIME_HEALTH_COMMISSIONED);
  });

  it('accepts a signed jovie.certification/v1 envelope around the harness report', () => {
    const envelope = signValue({
      contract: CERTIFICATION_CONTRACT,
      identity: 'summer',
      report: unsignedReport(),
    });
    expect(
      verifySignedCommissioningReceipt(envelope, publicKeyPem, 'summer')
    ).toBe(true);
  });

  it('fails closed on missing attestation, wrong key, string-swapped commissioned, or short receipt sets', () => {
    const unsigned = unsignedReport();
    expect(
      verifySignedCommissioningReceipt(unsigned, publicKeyPem, 'summer')
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        signValue(unsigned),
        otherPublicKeyPem,
        'summer'
      )
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        signValue(unsignedReport({ commissioned: 'commissioned' })),
        publicKeyPem,
        'summer'
      )
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        signValue(
          unsignedReport(
            {
              commissioned: true,
              summary: { capabilities: 1, certified: 1, blocking: 0 },
            },
            1
          )
        ),
        publicKeyPem,
        'summer'
      )
    ).toBe(false);
    const tampered = signValue(unsignedReport());
    tampered.commissioned = true;
    tampered.receipts = [];
    expect(
      verifySignedCommissioningReceipt(tampered, publicKeyPem, 'summer')
    ).toBe(false);
    expect(
      resolveRuntimeHealthStatus({
        identity: 'summer',
        environment: {
          SUMMER_COMMISSIONING_RECEIPT: '{',
          SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY: publicKeyPem,
        },
      })
    ).toBe(RUNTIME_HEALTH_UNCOMMISSIONED);
    expect(
      verifySignedCommissioningReceipt(
        {
          ...unsignedReport(),
          attestation: { algorithm: 'rsa', signature: 'abc' },
        },
        publicKeyPem,
        'summer'
      )
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        {
          ...unsignedReport(),
          attestation: { algorithm: 'ed25519', signature: '' },
        },
        publicKeyPem,
        'summer'
      )
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        signValue(unsignedReport()),
        'not-a-pem-key',
        'summer'
      )
    ).toBe(false);
    expect(
      verifySignedCommissioningReceipt(
        signValue(
          unsignedReport({
            receipts: [
              ...unsignedReport().receipts.slice(0, 15),
              {
                ...evaluationReceipt(15),
                critical: true,
                outcome: 'failed',
                actualState: 'blocked',
              },
            ],
            commissioned: true,
            summary: { capabilities: 16, certified: 16, blocking: 0 },
          })
        ),
        publicKeyPem,
        'summer'
      )
    ).toBe(false);
  });

  it('reads path-backed receipt bytes and stays uncommissioned when the path is unreadable', () => {
    const receipt = signValue(unsignedReport());
    expect(
      resolveRuntimeHealthStatus({
        identity: 'summer',
        environment: {
          SUMMER_COMMISSIONING_RECEIPT_PATH: '/tmp/signed-report.json',
          SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY_PATH: '/tmp/key.pem',
        },
        readFile: path => {
          if (path === '/tmp/signed-report.json')
            return JSON.stringify(receipt);
          if (path === '/tmp/key.pem') return publicKeyPem;
          throw new Error(`unexpected path ${path}`);
        },
      })
    ).toBe(RUNTIME_HEALTH_COMMISSIONED);
    expect(
      resolveRuntimeHealthStatus({
        identity: 'summer',
        environment: {
          SUMMER_COMMISSIONING_RECEIPT_PATH: '/tmp/missing.json',
          SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY: publicKeyPem,
        },
        readFile: () => {
          throw new Error('missing');
        },
      })
    ).toBe(RUNTIME_HEALTH_UNCOMMISSIONED);
  });
});

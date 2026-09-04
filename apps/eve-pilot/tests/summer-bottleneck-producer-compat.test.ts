import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signSummerBottleneckSnapshot } from '../../web/lib/ovie/summer-bottleneck-producer';
import {
  summerBottleneckSnapshotSchema,
  verifySummerBottleneckProducerAttestation,
} from '../agent/lib/summer-bottleneck-loop';

const SOURCE = 'a'.repeat(40);
const NOW = '2026-09-04T20:00:00.000Z';

function unsignedSnapshot() {
  const source = (digit: string) => ({
    observedAt: NOW,
    sourceDigest: digit.repeat(64),
    sourceRevision: SOURCE,
  });
  return {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1' as const,
    eventId: 'evt_producer_compat_0001',
    observedAt: NOW,
    sourceVersion: SOURCE,
    signals: {
      closure: {
        schema: 'jovie.eve.summer-closure-projection/v1' as const,
        sourceSchema: 'jovie-closure-health/v1' as const,
        ...source('1'),
        status: 'healthy' as const,
        blockedSince: null,
        openPullRequests: 1,
      },
      queue: {
        schema: 'jovie.eve.summer-queue-projection/v1' as const,
        sourceSchema: 'github-merge-queue-entry/v1' as const,
        ...source('2'),
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
      },
      release: {
        schema: 'jovie.eve.summer-release-projection/v1' as const,
        sourceSchema: 'jovie-controller-snapshot/v1' as const,
        ...source('3'),
        blockedSince: null,
        mainSha: SOURCE,
        productionSha: SOURCE,
        unverifiedMerges: 0,
      },
      runner: {
        schema: 'jovie.eve.summer-runner-projection/v1' as const,
        sourceSchema: 'symphony-lease-guard-report/v1' as const,
        ...source('4'),
        blockedSince: null,
        capacityAvailable: 1,
        queuedWork: 0,
      },
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1' as const,
        ...source('5'),
        classes: [
          'merge-group-flake-baseline-ratchet',
          'controller-cascade-coalescing',
          'auto-enroll-self-cancel-churn',
          'controller-check-run-pagination-cap',
          'obsolete-unaffected-native-lanes',
          'affected-only-unit-selection',
        ].map((id, index) => ({
          id,
          state: 'implemented' as const,
          blockedSince: NOW,
          impact: index + 1,
          owner: 'ci-owner',
          handle: `audit:${index}`,
        })),
      },
    },
  };
}

describe('Jovie Summer producer compatibility', () => {
  it('produces an attestation accepted by Eve without contract translation', () => {
    const keys = generateKeyPairSync('ed25519');
    const privateKey = keys.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString();
    const publicKey = keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString();
    const keyId = 'jovie-production-compat';

    const signed = signSummerBottleneckSnapshot(
      unsignedSnapshot(),
      privateKey,
      keyId
    );
    const parsed = summerBottleneckSnapshotSchema.parse(signed);

    expect(
      verifySummerBottleneckProducerAttestation(
        parsed,
        new Map([[keyId, publicKey]])
      )
    ).toBe(true);
  });
});

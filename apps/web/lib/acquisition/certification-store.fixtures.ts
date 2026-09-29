import { vi } from 'vitest';
import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  type AcquisitionCertificationCandidate,
  type AcquisitionCertificationPorts,
  AcquisitionCertificationStore,
  type AcquisitionDecisionRequest,
} from './certification-store';

/**
 * Shared acquisition certification fixtures. The store's own tests and the
 * Ovie customers-domain tests must drive the same candidate so a decision
 * taken through either surface lands the same receipt.
 */
export const ACQUISITION_SUBJECT =
  'acquisition:premade-artist-profile:lead1:run1';
export const ACQUISITION_SHA = 'a'.repeat(40);
export const ACQUISITION_NOW = '2026-09-12T22:00:00.000Z';

export function acquisitionProof(
  tier: CertificationEvidenceReceipt['tier']
): CertificationEvidenceReceipt {
  return {
    id: tier,
    tier,
    status: 'passed',
    sourceSha: ACQUISITION_SHA,
    ref: `fixture:${tier}`,
    digest: `fixture-digest:${tier}`,
    summary: 'Synthetic test evidence only',
  };
}

export function fixtureAcquisitionCandidate(): AcquisitionCertificationCandidate {
  return {
    subjectId: ACQUISITION_SUBJECT,
    leadId: 'lead1',
    runId: 'run1',
    profileId: 'profile1',
    revision: 'domain-revision-1',
    sourceRef: 'fixture:lead1/run1/revision1',
    displayName: 'Fixture artist',
    profileUrl: 'https://example.test/artist',
    claimUrl: 'https://example.test/claim',
    qualificationRef: 'fixture:qualification1',
    requestedScope: 'Review premade profile only; no external send',
    observedAt: '2026-09-12T21:00:00.000Z',
    expiresAt: '2026-09-13T21:00:00.000Z',
    packet: {
      contract: 'jovie.certification/v1',
      subject: {
        id: ACQUISITION_SUBJECT,
        kind: 'acquisition-premade-artist-profile',
        title: 'Fixture artist',
      },
      source: {
        repository: 'JovieInc/Jovie',
        ref: 'fixture:evaluator',
        sha: ACQUISITION_SHA,
        expectedSha: ACQUISITION_SHA,
        paths: ['lib/acquisition/kernel.ts'],
        digest: 'fixture:evaluator-source',
      },
      canonicalReferences: [acquisitionProof('canonical_references')],
      invariantEvaluation: [acquisitionProof('invariant_evaluation')],
      testsCoverage: [acquisitionProof('tests_coverage')],
      visualProof: [acquisitionProof('visual_proof')],
      requiredVariants: [
        {
          id: 'profile',
          label: 'Profile',
          sourceSha: ACQUISITION_SHA,
          proof: acquisitionProof('required_variants'),
          requiredMediaIds: ['profile-media'],
        },
      ],
      itemMedia: [
        {
          id: 'profile-media',
          itemId: ACQUISITION_SUBJECT,
          variantId: 'profile',
          status: 'passed',
          sourceSha: ACQUISITION_SHA,
          ref: 'fixture:profile-media',
          digest: 'fixture:profile-content',
          summary: 'Fixture profile',
        },
      ],
    },
  };
}

export function acquisitionStoreHarness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: vi.fn(async key => records.get(key) ?? null),
    setIfAbsent: vi.fn(async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    }),
    compareAndSet: vi.fn(async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    }),
  };
  let current = fixtureAcquisitionCandidate();
  const effects = new Map<string, { digest: string; receipt: string }>();
  const execute = vi.fn(
    async ({
      receipt,
    }: Parameters<
      NonNullable<AcquisitionCertificationPorts['effect']>['execute']
    >[0]) => {
      const prior = effects.get(receipt.dispatch.key);
      if (prior && prior.digest !== receipt.payloadDigest)
        throw new Error('Domain conflicting duplicate');
      const result = prior ?? {
        digest: receipt.payloadDigest,
        receipt: `effect:${effects.size + 1}`,
      };
      effects.set(receipt.dispatch.key, result);
      return result.receipt;
    }
  );
  const ports: AcquisitionCertificationPorts = {
    withCurrentCandidate: async (_subject, operation) =>
      operation(structuredClone(current)),
    authorize: vi.fn(async () => 'server-resolved-founder'),
    effect: { idempotency: 'durable-action-key-and-payload-digest', execute },
    now: () => ACQUISITION_NOW,
  };
  const store = new AcquisitionCertificationStore(backend, ports);
  return {
    store,
    backend,
    records,
    ports,
    effects,
    execute,
    replace: (next: AcquisitionCertificationCandidate) => {
      current = next;
    },
    async request(): Promise<AcquisitionDecisionRequest> {
      const projection = await store.project(ACQUISITION_SUBJECT);
      return {
        subjectId: ACQUISITION_SUBJECT,
        revision: current.revision,
        evidenceDigest: projection.evidenceDigest,
        actionId: 'action1',
        decision: 'approved',
        notes: null,
      };
    },
  };
}

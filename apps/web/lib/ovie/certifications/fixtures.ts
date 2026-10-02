import {
  type CertificationEvidenceReceipt,
  type CertificationEvidenceStatus,
  type CertificationReviewPacket,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
} from '@/lib/agent-os/certification';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import { projectCertificationInbox } from '@/lib/agent-os/certification-inbox';
import { normalizeKernelCertificationRow } from './normalize';
import type {
  OvieCertificationDomainId,
  OvieCertificationInventory,
  OvieCertificationRow,
} from './types';

/**
 * Deterministic certification fixtures for tests and stories. They exercise
 * the real kernel admission, so a fixture row's state is never hand-written.
 */
export const FIXTURE_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
export const FIXTURE_NOW = '2026-09-27T08:00:00.000Z';

export function fixtureReceipt(
  tier: CertificationEvidenceReceipt['tier'],
  id: string,
  status: CertificationEvidenceStatus = 'passed',
  ref = `docs/certification/2026-09-27/${id}.md`
): CertificationEvidenceReceipt {
  return {
    id,
    tier,
    status,
    sourceSha: FIXTURE_SHA,
    ref,
    digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    summary: `${id} ${status}`,
  };
}

export function fixturePacket(
  subjectId: string,
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
  const mediaId = `${subjectId}-media`;
  return {
    contract: 'jovie.certification/v1',
    subject: { id: subjectId, kind: 'flow', title: `Flow ${subjectId}` },
    source: {
      repository: 'JovieInc/Jovie',
      ref: 'refs/heads/main',
      sha: FIXTURE_SHA,
      expectedSha: FIXTURE_SHA,
      paths: ['apps/web/app/(auth)/signup/page.tsx'],
      digest: null,
    },
    canonicalReferences: [
      fixtureReceipt('canonical_references', `${subjectId}-ref`),
    ],
    invariantEvaluation: [
      fixtureReceipt('invariant_evaluation', `${subjectId}-invariant`),
    ],
    testsCoverage: [
      fixtureReceipt(
        'tests_coverage',
        `${subjectId}-tests`,
        'passed',
        'https://github.com/JovieInc/Jovie/actions/runs/1'
      ),
    ],
    visualProof: [
      fixtureReceipt(
        'visual_proof',
        `${subjectId}-visual`,
        'passed',
        'https://example.test/screenshot.png'
      ),
    ],
    requiredVariants: [
      {
        id: `${subjectId}-desktop`,
        label: 'Desktop',
        sourceSha: FIXTURE_SHA,
        proof: fixtureReceipt('required_variants', `${subjectId}-variant`),
        requiredMediaIds: [mediaId],
      },
    ],
    itemMedia: [
      {
        id: mediaId,
        itemId: subjectId,
        variantId: `${subjectId}-desktop`,
        status: 'passed',
        sourceSha: FIXTURE_SHA,
        ref: `docs/certification/2026-09-27/${mediaId}.png`,
        digest: `sha256:${mediaId.padEnd(64, '0').slice(0, 64)}`,
        summary: 'Desktop screenshot',
      },
    ],
    operational: {},
    ...overrides,
  };
}

export function memoryCertificationBackend(
  records = new Map<string, unknown>()
): CertificationRecordBackend & { readonly records: Map<string, unknown> } {
  return {
    records,
    async get(key) {
      return records.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    async compareAndSet(key, expected, next) {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
  };
}

export function fixtureRow(
  subjectId: string,
  options: {
    readonly domain?: OvieCertificationDomainId;
    readonly surface?: string;
    readonly packet?: CertificationReviewPacket;
    readonly decisions?: readonly FounderCertificationDecision[];
    readonly updatedAt?: string;
  } = {}
): OvieCertificationRow {
  const packet = options.packet ?? fixturePacket(subjectId);
  const decisions = options.decisions ?? [];
  const admission = evaluateCertificationAdmission({
    packet,
    decisions,
    evaluatedAt: FIXTURE_NOW,
  });
  return normalizeKernelCertificationRow({
    domain: options.domain ?? 'flows',
    surface: options.surface ?? 'Golden Path',
    packet,
    admission,
    decisions,
    auditHistory: admission.auditHistory,
    updatedAt: options.updatedAt ?? FIXTURE_NOW,
    links: [
      {
        label: 'Dogfood transcript',
        href: 'https://example.test/transcript',
        kind: 'transcript',
      },
    ],
  });
}

/** A mixed inventory: review-ready, working, and certified rows. */
export function fixtureInventory(
  generatedAt: string = FIXTURE_NOW
): OvieCertificationInventory {
  const readyPacket = fixturePacket('signup-golden-path');
  const ready = fixtureRow('signup-golden-path', { packet: readyPacket });
  const workingPacket = fixturePacket('claim-profile', {
    visualProof: [fixtureReceipt('visual_proof', 'claim-visual', 'failed')],
  });
  const working = fixtureRow('claim-profile', {
    packet: workingPacket,
    updatedAt: '2026-09-27T06:30:00.000Z',
  });
  const certifiedPacket = fixturePacket('public-profile', {
    subject: { id: 'public-profile', kind: 'surface', title: 'Public Profile' },
  });
  const certifiedDecisions: FounderCertificationDecision[] = [
    {
      id: 'decision-fixture',
      subjectId: 'public-profile',
      evidenceDigest:
        evaluateCertificationAdmission({ packet: certifiedPacket })
          .decisionEvidenceDigest ?? '',
      decision: 'approved',
      decidedAt: '2026-09-27T07:00:00.000Z',
      reviewer: 'founder@example.test',
      notes: null,
    },
  ];
  const certified = fixtureRow('public-profile', {
    domain: 'public_profiles',
    surface: 'Profile Page',
    packet: certifiedPacket,
    decisions: certifiedDecisions,
    updatedAt: '2026-09-27T07:00:00.000Z',
  });
  const rows = [ready, working, certified];
  return {
    contract: 'jovie.ovie-certification-inventory/v1',
    generatedAt,
    universal: false,
    domains: [
      {
        domain: 'flows',
        label: 'Flows',
        status: 'connected',
        rowCount: 2,
        note: null,
      },
      {
        domain: 'public_profiles',
        label: 'Public Profiles',
        status: 'connected',
        rowCount: 1,
        note: null,
      },
      {
        domain: 'acquisition',
        label: 'Acquisition',
        status: 'not_connected',
        rowCount: 0,
        note: 'No trusted production candidate inventory exists yet.',
      },
    ],
    counts: {
      working: 1,
      review_ready: 1,
      founder_locked: 1,
      shipped: 0,
      monitored: 0,
      total: 3,
    },
    queue: projectCertificationInbox([
      {
        admission: evaluateCertificationAdmission({ packet: readyPacket }),
        domain: 'flows',
        observedAt: generatedAt,
        packet: readyPacket,
      },
      {
        admission: evaluateCertificationAdmission({ packet: workingPacket }),
        domain: 'flows',
        observedAt: '2026-09-27T06:30:00.000Z',
        packet: workingPacket,
      },
      {
        admission: evaluateCertificationAdmission({
          packet: certifiedPacket,
          decisions: certifiedDecisions,
        }),
        domain: 'public_profiles',
        observedAt: '2026-09-27T07:00:00.000Z',
        packet: certifiedPacket,
      },
    ]),
    rows,
    issues: [],
  };
}

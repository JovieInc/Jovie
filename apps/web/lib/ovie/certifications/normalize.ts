import type {
  CertificationAdmission,
  CertificationAuditEvent,
  CertificationEvidenceReceipt,
  CertificationEvidenceStatus,
  CertificationReviewPacket,
  FounderCertificationDecision,
} from '@/lib/agent-os/certification';
import {
  OVIE_CERTIFICATION_STATES,
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationDecisionAvailability,
  type OvieCertificationDomainId,
  type OvieCertificationEvidence,
  type OvieCertificationHistoryEvent,
  type OvieCertificationInventory,
  type OvieCertificationLink,
  type OvieCertificationRow,
  type OvieCertificationState,
  type OvieCertificationTier,
  type OvieCertificationTierStatus,
} from './types';

/** Rails stay readable: the newest events matter; the ledger keeps the rest. */
export const OVIE_CERTIFICATION_HISTORY_LIMIT = 50;

export interface KernelCertificationRowInput {
  readonly domain: OvieCertificationDomainId;
  readonly surface: string;
  readonly packet: CertificationReviewPacket;
  readonly admission: CertificationAdmission;
  readonly decisions: readonly FounderCertificationDecision[];
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
  readonly links?: readonly OvieCertificationLink[];
  /**
   * Domain-owned precondition for founder actions beyond kernel admission,
   * e.g. marketing's assurance profile. `null` means no extra gate.
   */
  readonly domainDecisionGate?: string | null;
}

interface TierReceipt {
  readonly id: string;
  readonly tier: OvieCertificationTier;
  readonly status: CertificationEvidenceStatus;
  readonly summary: string;
  readonly ref: string;
}

function packetReceipts(packet: CertificationReviewPacket): TierReceipt[] {
  const fromReceipt = (
    receipt: CertificationEvidenceReceipt,
    tier: OvieCertificationTier = receipt.tier
  ): TierReceipt => ({
    id: receipt.id,
    tier,
    status: receipt.status,
    summary: receipt.summary,
    ref: receipt.ref,
  });
  const operational = packet.operational ?? {};

  return [
    ...packet.canonicalReferences.map(r =>
      fromReceipt(r, 'canonical_references')
    ),
    ...packet.invariantEvaluation.map(r =>
      fromReceipt(r, 'invariant_evaluation')
    ),
    ...packet.testsCoverage.map(r => fromReceipt(r, 'tests_coverage')),
    ...packet.visualProof.map(r => fromReceipt(r, 'visual_proof')),
    ...packet.requiredVariants.map(variant =>
      variant.proof
        ? fromReceipt(variant.proof, 'required_variants')
        : {
            id: variant.id,
            tier: 'required_variants' as const,
            status: 'missing' as const,
            summary: `${variant.label}: no proof attached.`,
            ref: '',
          }
    ),
    ...packet.itemMedia.map(media => ({
      id: media.id,
      tier: 'required_variants' as const,
      status: media.status,
      summary: media.summary,
      ref: media.ref,
    })),
    ...(operational.ci ?? []).map(r => fromReceipt(r, 'ci')),
    ...(operational.queueMerge ?? []).map(r => fromReceipt(r, 'queue_merge')),
    ...(operational.deploy ?? []).map(r => fromReceipt(r, 'deploy')),
    ...(operational.runtimeDogfood ?? []).map(r =>
      fromReceipt(r, 'runtime_dogfood')
    ),
  ];
}

function receiptStatus(
  status: CertificationEvidenceStatus
): OvieCertificationTierStatus {
  if (status === 'blocked') return 'failed';
  return status;
}

function aggregateTier(
  tier: OvieCertificationTier,
  receipts: readonly TierReceipt[],
  packet: CertificationReviewPacket,
  blockedTiers: ReadonlySet<string>
): OvieCertificationTierStatus {
  if (tier === 'canonical_source') {
    if (!packet.source) return 'missing';
    return blockedTiers.has(tier) ? 'failed' : 'passed';
  }
  const statuses = receipts
    .filter(receipt => receipt.tier === tier)
    .map(receipt => receiptStatus(receipt.status));
  if (statuses.length === 0) return 'missing';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.some(status => status !== 'passed')) return 'pending';
  // A receipt that passed at the wrong source SHA still blocks the tier.
  return blockedTiers.has(tier) ? 'failed' : 'passed';
}

/**
 * Receipt refs become links only when they are navigable: absolute URLs, or
 * repo-relative paths resolved against the packet's own source commit.
 */
export function resolveEvidenceHref(
  ref: string,
  source: CertificationReviewPacket['source']
): string | null {
  const trimmed = ref.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    source &&
    /^[\w.-]+\/[\w.-]+$/.test(source.repository) &&
    /^[0-9a-f]{7,40}$/i.test(source.sha) &&
    /^[\w@.-]+(\/[\w@.-]+)+$/.test(trimmed)
  ) {
    return `https://github.com/${source.repository}/blob/${source.sha}/${trimmed}`;
  }
  return null;
}

function history(
  auditHistory: readonly CertificationAuditEvent[],
  decisions: readonly FounderCertificationDecision[]
): OvieCertificationHistoryEvent[] {
  const events: OvieCertificationHistoryEvent[] = [
    ...auditHistory.map(event => ({
      at: event.at,
      kind: 'audit' as const,
      type: event.type,
      summary: event.summary,
      actor: null,
    })),
    ...decisions.map(decision => ({
      at: decision.decidedAt,
      kind: 'decision' as const,
      type: decision.decision,
      summary: decision.notes?.trim() || decisionSummary(decision.decision),
      actor: decision.reviewer,
    })),
  ];
  return events
    .sort(
      (a, b) =>
        Date.parse(b.at) - Date.parse(a.at) ||
        // The human decision leads the audit events it caused.
        Number(b.kind === 'decision') - Number(a.kind === 'decision')
    )
    .slice(0, OVIE_CERTIFICATION_HISTORY_LIMIT);
}

function decisionSummary(
  decision: FounderCertificationDecision['decision']
): string {
  if (decision === 'approved') return 'Certified by founder.';
  if (decision === 'changes_requested') return 'Founder requested changes.';
  return 'Rejected by founder.';
}

function decisionAvailability(
  input: KernelCertificationRowInput
): OvieCertificationDecisionAvailability {
  const { admission, decisions } = input;
  const evidenceDigest = admission.decisionEvidenceDigest;
  const unavailable = (reason: string) => ({
    available: false,
    reason,
    evidenceDigest,
  });

  if (!evidenceDigest) {
    return unavailable('The packet does not use the current kernel contract.');
  }
  if (decisions.some(decision => decision.evidenceDigest === evidenceDigest)) {
    return unavailable('A founder decision already exists for this evidence.');
  }
  if (admission.state !== 'review_ready') {
    const count = admission.blockers.length;
    return unavailable(
      count > 0
        ? `Evidence is incomplete: ${count} blocker${count === 1 ? '' : 's'}.`
        : 'Only review-ready items take a founder decision.'
    );
  }
  if (input.domainDecisionGate) return unavailable(input.domainDecisionGate);
  return { available: true, reason: null, evidenceDigest };
}

export function normalizeKernelCertificationRow(
  input: KernelCertificationRowInput
): OvieCertificationRow {
  const { packet, admission } = input;
  const receipts = packetReceipts(packet);
  const blockedTiers = new Set(admission.blockers.map(b => b.tier));
  const blockedReceipts = new Set(
    admission.blockers.map(blocker => `${blocker.tier}:${blocker.id}`)
  );
  const tiers = Object.fromEntries(
    OVIE_CERTIFICATION_TIERS.map(tier => [
      tier,
      aggregateTier(tier, receipts, packet, blockedTiers),
    ])
  ) as Record<OvieCertificationTier, OvieCertificationTierStatus>;

  const evidence: OvieCertificationEvidence[] = receipts.map(receipt => ({
    id: receipt.id,
    tier: receipt.tier,
    // A provider's pass is not current proof when the kernel rejects its
    // source binding, digest, or required media relationship.
    status:
      receipt.status === 'passed' &&
      blockedReceipts.has(`${receipt.tier}:${receipt.id}`)
        ? 'failed'
        : receiptStatus(receipt.status),
    summary: receipt.summary,
    ref: receipt.ref,
    href: resolveEvidenceHref(receipt.ref, packet.source),
  }));

  return {
    id: `${input.domain}:${packet.subject.id}`,
    domain: input.domain,
    surface: input.surface,
    subject: {
      id: packet.subject.id,
      kind: packet.subject.kind,
      title: packet.subject.title,
    },
    state: admission.state,
    tiers,
    evidence,
    blockers: admission.blockers.map(blocker => ({
      code: blocker.code,
      tier: blocker.tier,
      summary: blocker.summary,
    })),
    staleFounderLock: admission.staleFounderLock !== null,
    updatedAt: input.updatedAt,
    links: input.links ?? [],
    history: history(input.auditHistory, input.decisions),
    decision: decisionAvailability(input),
    source: packet.source
      ? {
          repository: packet.source.repository,
          sha: packet.source.sha,
          paths: packet.source.paths,
        }
      : null,
  };
}

export function countCertificationStates(
  rows: readonly OvieCertificationRow[]
): OvieCertificationInventory['counts'] {
  const counts = Object.fromEntries(
    OVIE_CERTIFICATION_STATES.map(state => [state, 0])
  ) as Record<OvieCertificationState, number>;
  for (const row of rows) counts[row.state] += 1;
  return { ...counts, total: rows.length };
}

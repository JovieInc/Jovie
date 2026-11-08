import { sha256 as sha256Bytes } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type {
  CertificationAdmission,
  CertificationAuditEvent,
  CertificationBaselineStatus,
  CertificationBlocker,
  CertificationBlockerCode,
  CertificationCertifierAuthority,
  CertificationEvidenceReceipt,
  CertificationEvidenceTier,
  CertificationItemMediaReceipt,
  CertificationOperationalEvidence,
  CertificationOperationalEvidenceTier,
  CertificationRequiredVariant,
  CertificationReviewPacket,
  CertificationState,
  CertificationTasteEvidenceTier,
  CertificationTasteInboxCard,
  EvaluateCertificationAdmissionInput,
  FounderCertificationDecision,
  RecordFounderCertificationDecisionInput,
  RecordFounderCertificationDecisionResult,
} from './certification-types';
import {
  CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
  CERTIFICATION_STATES,
  JOVIE_CERTIFICATION_CONTRACT,
} from './certification-types';

export * from './certification-types';

/**
 * Visual proof is only admitted with a real dogfood-judge receipt (a vision
 * model that watched the recorded run against the taste rubric). Producers
 * must never fabricate one; without it the kernel blocks.
 */
export const DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX = 'dogfood-judge:';

const MISSING_TASTE_BLOCKER_CODES = {
  canonical_references: 'canonical_reference_missing',
  canonical_source: 'source_missing',
  invariant_evaluation: 'invariant_evaluation_missing',
  required_variants: 'required_variant_missing',
  tests_coverage: 'tests_coverage_missing',
  visual_proof: 'visual_proof_missing',
} as const satisfies Record<
  CertificationTasteEvidenceTier,
  CertificationBlockerCode
>;

const FAILED_BLOCKER_CODES = {
  canonical_references: 'canonical_reference_failed',
  canonical_source: 'source_sha_mismatch',
  ci: 'ci_failed',
  deploy: 'deploy_failed',
  invariant_evaluation: 'invariant_evaluation_failed',
  queue_merge: 'queue_merge_failed',
  required_variants: 'required_variant_failed',
  runtime_dogfood: 'runtime_dogfood_failed',
  tests_coverage: 'tests_coverage_failed',
  visual_proof: 'visual_proof_failed',
} as const satisfies Record<
  CertificationEvidenceTier,
  CertificationBlockerCode
>;

const MISSING_OPERATIONAL_BLOCKER_CODES = {
  ci: 'ci_missing',
  deploy: 'deploy_missing',
  queue_merge: 'queue_merge_missing',
  runtime_dogfood: 'runtime_dogfood_missing',
} as const satisfies Record<
  CertificationOperationalEvidenceTier,
  CertificationBlockerCode
>;

const OPERATIONAL_PACKET_KEYS = {
  ci: 'ci',
  deploy: 'deploy',
  queue_merge: 'queueMerge',
  runtime_dogfood: 'runtimeDogfood',
} as const satisfies Record<
  CertificationOperationalEvidenceTier,
  keyof CertificationOperationalEvidence
>;

interface StableObject {
  readonly [key: string]: StableValue;
}

type StableValue =
  | string
  | number
  | boolean
  | null
  | readonly StableValue[]
  | StableObject;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function byId<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function stableSerialize(value: StableValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

function sha256(value: StableValue): string {
  // Isomorphic so certification fixtures also render in browser stories.
  return `sha256:${bytesToHex(sha256Bytes(utf8ToBytes(stableSerialize(value))))}`;
}

function receiptDigestInput(
  receipt: CertificationEvidenceReceipt
): StableObject {
  return {
    digest: receipt.digest,
    id: receipt.id,
    ref: receipt.ref,
    sourceSha: receipt.sourceSha,
    status: receipt.status,
    summary: receipt.summary,
    tier: receipt.tier,
  };
}

function mediaDigestInput(media: CertificationItemMediaReceipt): StableObject {
  return {
    digest: media.digest,
    id: media.id,
    itemId: media.itemId,
    ref: media.ref,
    sourceSha: media.sourceSha,
    status: media.status,
    summary: media.summary,
    variantId: media.variantId,
  };
}

function variantDigestInput(
  variant: CertificationRequiredVariant
): StableObject {
  return {
    id: variant.id,
    label: variant.label,
    proof: variant.proof ? receiptDigestInput(variant.proof) : null,
    requiredMediaIds: uniqueSorted(variant.requiredMediaIds),
    sourceSha: variant.sourceSha,
  };
}

function buildDecisionDigestInput(
  packet: CertificationReviewPacket
): StableObject {
  return {
    canonicalReferences: byId(packet.canonicalReferences).map(
      receiptDigestInput
    ),
    contract: packet.contract,
    invariantEvaluation: byId(packet.invariantEvaluation).map(
      receiptDigestInput
    ),
    itemMedia: byId(packet.itemMedia).map(mediaDigestInput),
    requiredVariants: byId(packet.requiredVariants).map(variantDigestInput),
    source: packet.source
      ? {
          digest: packet.source.digest ?? null,
          paths: uniqueSorted(packet.source.paths),
          ref: packet.source.ref,
          repository: packet.source.repository,
          sha: packet.source.sha,
        }
      : null,
    subject: {
      id: packet.subject.id,
      kind: packet.subject.kind,
      title: packet.subject.title,
    },
    testsCoverage: byId(packet.testsCoverage).map(receiptDigestInput),
    visualProof: byId(packet.visualProof).map(receiptDigestInput),
  };
}

export function buildCertificationDecisionDigest(
  packet: CertificationReviewPacket
): string {
  return sha256(buildDecisionDigestInput(packet));
}

function blocker(
  code: CertificationBlockerCode,
  tier: CertificationEvidenceTier | 'decision' | 'state',
  id: string,
  summary: string
): CertificationBlocker {
  return { code, tier, id, summary };
}

function sourceSha(packet: CertificationReviewPacket): string | null {
  return packet.source?.sha ?? null;
}

function receiptPassedForSource(
  packet: CertificationReviewPacket,
  receipt: CertificationEvidenceReceipt
): CertificationBlocker | null {
  if (receipt.status !== 'passed') {
    return blocker(
      FAILED_BLOCKER_CODES[receipt.tier],
      receipt.tier,
      receipt.id,
      `${receipt.tier} receipt must be passed.`
    );
  }

  if (!receipt.ref.trim() || !receipt.digest?.trim()) {
    return blocker(
      FAILED_BLOCKER_CODES[receipt.tier],
      receipt.tier,
      receipt.id,
      `${receipt.tier} receipt requires an evidence reference and content digest.`
    );
  }

  const packetSourceSha = sourceSha(packet);
  if (!packetSourceSha || receipt.sourceSha !== packetSourceSha) {
    return blocker(
      'evidence_source_sha_mismatch',
      receipt.tier,
      receipt.id,
      `Evidence receipt source ${receipt.sourceSha} does not match ${packetSourceSha}.`
    );
  }

  return null;
}

function receiptMatchesTier(
  receipt: CertificationEvidenceReceipt,
  expectedTier: CertificationEvidenceTier
): CertificationBlocker | null {
  if (receipt.tier === expectedTier) return null;

  return blocker(
    FAILED_BLOCKER_CODES[expectedTier],
    expectedTier,
    receipt.id,
    `${expectedTier} evidence cannot be satisfied by ${receipt.tier}.`
  );
}

function requireReceiptGroup(
  packet: CertificationReviewPacket,
  receipts: readonly CertificationEvidenceReceipt[],
  tier: CertificationTasteEvidenceTier
): CertificationBlocker[] {
  if (receipts.length === 0) {
    return [
      blocker(
        MISSING_TASTE_BLOCKER_CODES[tier],
        tier,
        tier,
        `${tier} evidence is required.`
      ),
    ];
  }

  return receipts.flatMap(receipt =>
    [
      receiptMatchesTier(receipt, tier),
      receiptPassedForSource(packet, receipt),
    ].filter((issue): issue is CertificationBlocker => issue !== null)
  );
}

function requireDogfoodJudgeReceipt(
  packet: CertificationReviewPacket
): CertificationBlocker[] {
  // An empty group is already reported as visual_proof_missing.
  if (packet.visualProof.length === 0) return [];
  const judged = packet.visualProof.filter(
    receipt =>
      receipt.tier === 'visual_proof' &&
      receipt.id.startsWith(DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX)
  );
  if (judged.length === 0) {
    return [
      blocker(
        'visual_proof_judge_missing',
        'visual_proof',
        'visual_proof',
        `visual_proof requires a passing ${DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX} receipt.`
      ),
    ];
  }
  // Failed judge receipts are already blocked by the group check
  // (visual_proof_failed); at least one must pass for this source.
  return judged.some(
    receipt => receiptPassedForSource(packet, receipt) === null
  )
    ? []
    : [
        blocker(
          'visual_proof_failed',
          'visual_proof',
          judged[0].id,
          'No dogfood-judge receipt passed for this source.'
        ),
      ];
}

function collectSourceBlockers(packet: CertificationReviewPacket) {
  const source = packet.source;
  if (!source) {
    return [
      blocker(
        'source_missing',
        'canonical_source',
        'source',
        'Canonical source receipt is required.'
      ),
    ];
  }

  const blockers: CertificationBlocker[] = [];
  if (!/^[0-9a-f]{40}$/i.test(source.sha)) {
    blockers.push(
      blocker(
        'source_missing',
        'canonical_source',
        'source.sha',
        'Canonical source must identify a full 40-hex commit SHA.'
      )
    );
  }
  if (source.expectedSha && source.expectedSha !== source.sha) {
    blockers.push(
      blocker(
        'source_sha_mismatch',
        'canonical_source',
        'source.expectedSha',
        `Expected source SHA ${source.expectedSha} does not match ${source.sha}.`
      )
    );
  }
  if (source.paths.length === 0) {
    blockers.push(
      blocker(
        'source_path_missing',
        'canonical_source',
        'source.paths',
        'At least one canonical source path is required.'
      )
    );
  }
  return blockers;
}

function collectRequiredVariantBlockers(packet: CertificationReviewPacket) {
  const mediaById = new Map(packet.itemMedia.map(media => [media.id, media]));
  const packetSourceSha = sourceSha(packet);

  return packet.requiredVariants.flatMap(variant => [
    ...collectVariantSourceBlockers(variant, packetSourceSha),
    ...collectVariantProofBlockers(packet, variant),
    ...collectVariantMediaBlockers(variant, mediaById, packetSourceSha),
  ]);
}

function collectVariantSourceBlockers(
  variant: CertificationRequiredVariant,
  packetSourceSha: string | null
): CertificationBlocker[] {
  if (!packetSourceSha || variant.sourceSha === packetSourceSha) return [];

  return [
    blocker(
      'evidence_source_sha_mismatch',
      'required_variants',
      variant.id,
      `Required variant source ${variant.sourceSha} does not match ${packetSourceSha}.`
    ),
  ];
}

function collectVariantProofBlockers(
  packet: CertificationReviewPacket,
  variant: CertificationRequiredVariant
): CertificationBlocker[] {
  if (!variant.proof) {
    return [
      blocker(
        'required_variant_missing',
        'required_variants',
        variant.id,
        `Required variant ${variant.id} is missing proof.`
      ),
    ];
  }

  const proofIssues = [
    receiptMatchesTier(variant.proof, 'required_variants'),
    receiptPassedForSource(packet, variant.proof),
  ].filter((issue): issue is CertificationBlocker => issue !== null);
  if (proofIssues.length === 0) return [];

  return proofIssues.map(issue => ({
    ...issue,
    code: 'required_variant_failed',
    tier: 'required_variants',
    summary: `Required variant ${variant.id} proof is not current and passed.`,
  }));
}

function collectVariantMediaBlockers(
  variant: CertificationRequiredVariant,
  mediaById: ReadonlyMap<string, CertificationItemMediaReceipt>,
  packetSourceSha: string | null
): CertificationBlocker[] {
  return uniqueSorted(variant.requiredMediaIds).flatMap(mediaId => {
    const media = mediaById.get(mediaId);
    return media
      ? collectMediaReceiptBlockers(media, variant, packetSourceSha)
      : [
          blocker(
            'required_media_missing',
            'required_variants',
            mediaId,
            `Required item-specific media ${mediaId} is missing.`
          ),
        ];
  });
}

function collectMediaReceiptBlockers(
  media: CertificationItemMediaReceipt,
  variant: CertificationRequiredVariant,
  packetSourceSha: string | null
): CertificationBlocker[] {
  const blockers: CertificationBlocker[] = [];

  if (media.status !== 'passed') {
    blockers.push(
      blocker(
        'required_media_failed',
        'required_variants',
        media.id,
        `Required item-specific media ${media.id} must be passed.`
      )
    );
  }
  if (!media.ref.trim() || !media.digest?.trim()) {
    blockers.push(
      blocker(
        'required_media_failed',
        'required_variants',
        media.id,
        'Required media needs an evidence reference and content digest.'
      )
    );
  }
  if (media.variantId !== variant.id) {
    blockers.push(
      blocker(
        'required_media_failed',
        'required_variants',
        media.id,
        `Required item-specific media ${media.id} is not attached to ${variant.id}.`
      )
    );
  }
  if (!packetSourceSha || media.sourceSha !== packetSourceSha) {
    blockers.push(
      blocker(
        'evidence_source_sha_mismatch',
        'required_variants',
        media.id,
        `Required media source ${media.sourceSha} does not match ${packetSourceSha}.`
      )
    );
  }

  return blockers;
}

function collectTasteBlockers(packet: CertificationReviewPacket) {
  if (packet.contract !== JOVIE_CERTIFICATION_CONTRACT) {
    return [
      blocker(
        'contract_mismatch',
        'canonical_source',
        'contract',
        `Certification packet must use ${JOVIE_CERTIFICATION_CONTRACT}.`
      ),
    ];
  }

  return [
    ...collectSourceBlockers(packet),
    ...requireReceiptGroup(
      packet,
      packet.canonicalReferences,
      'canonical_references'
    ),
    ...requireReceiptGroup(
      packet,
      packet.invariantEvaluation,
      'invariant_evaluation'
    ),
    ...requireReceiptGroup(packet, packet.testsCoverage, 'tests_coverage'),
    ...requireReceiptGroup(packet, packet.visualProof, 'visual_proof'),
    ...requireDogfoodJudgeReceipt(packet),
    ...collectRequiredVariantBlockers(packet),
  ];
}

function operationalReceipts(
  packet: CertificationReviewPacket,
  tier: CertificationOperationalEvidenceTier
): readonly CertificationEvidenceReceipt[] {
  return packet.operational?.[OPERATIONAL_PACKET_KEYS[tier]] ?? [];
}

function requireOperationalTier(
  packet: CertificationReviewPacket,
  tier: CertificationOperationalEvidenceTier
): CertificationBlocker[] {
  const receipts = operationalReceipts(packet, tier);
  if (receipts.length === 0) {
    return [
      blocker(
        MISSING_OPERATIONAL_BLOCKER_CODES[tier],
        tier,
        tier,
        `${tier} receipt is required.`
      ),
    ];
  }

  return receipts
    .flatMap(receipt =>
      [
        receiptMatchesTier(receipt, tier),
        receiptPassedForSource(packet, receipt),
      ].filter((issue): issue is CertificationBlocker => issue !== null)
    )
    .map(issue => ({
      ...issue,
      code: FAILED_BLOCKER_CODES[tier],
    }));
}

function collectDecisionBlockers(
  digest: string,
  decisions: readonly FounderCertificationDecision[]
): CertificationBlocker[] {
  const sameDigestCount = decisions.filter(
    decision => decision.evidenceDigest === digest
  ).length;
  if (sameDigestCount <= 1) return [];

  return [
    blocker(
      'duplicate_founder_decision',
      'decision',
      digest,
      'Only one founder decision may bind to a decision-evidence digest.'
    ),
  ];
}

function findCurrentDecision(
  digest: string,
  decisions: readonly FounderCertificationDecision[]
): FounderCertificationDecision | null {
  return decisions.find(decision => decision.evidenceDigest === digest) ?? null;
}

/** Absent 'certifierAuthority' predates this field and was always human. */
function certifierAuthorityOf(
  decision: FounderCertificationDecision
): CertificationCertifierAuthority {
  return decision.certifierAuthority ?? 'human';
}

function findStaleFounderLock(
  packet: CertificationReviewPacket,
  digest: string,
  decisions: readonly FounderCertificationDecision[]
): FounderCertificationDecision | null {
  return (
    decisions.find(
      decision =>
        decision.subjectId === packet.subject.id &&
        decision.decision === 'approved' &&
        certifierAuthorityOf(decision) === 'human' &&
        decision.evidenceDigest !== digest
    ) ?? null
  );
}

/**
 * JOV-6947: the protected canonical baseline — the most recent human-authority
 * approval for this subject, regardless of the evidence digest it bound to.
 * A machine-authority approval never qualifies: only an explicit human
 * certification can establish or replace this baseline.
 */
function findFounderBaseline(
  packet: CertificationReviewPacket,
  decisions: readonly FounderCertificationDecision[]
): FounderCertificationDecision | null {
  return decisions
    .filter(
      decision =>
        decision.subjectId === packet.subject.id &&
        decision.decision === 'approved' &&
        certifierAuthorityOf(decision) === 'human'
    )
    .reduce<FounderCertificationDecision | null>((latest, candidate) => {
      if (!latest) return candidate;
      return Date.parse(candidate.decidedAt) >= Date.parse(latest.decidedAt)
        ? candidate
        : latest;
    }, null);
}

/**
 * JOV-6947: derive the registry's human-certification axis from the same
 * decisions ledger `evaluateCertificationAdmission` already evaluates —
 * never a second store, and never a reinterpretation of machine-green as
 * human-certified.
 */
function evaluateBaselineStatus({
  state,
  currentDecision,
  founderBaseline,
}: {
  readonly state: CertificationState;
  readonly currentDecision: FounderCertificationDecision | null;
  readonly founderBaseline: FounderCertificationDecision | null;
}): CertificationBaselineStatus {
  if (
    currentDecision?.decision === 'approved' &&
    certifierAuthorityOf(currentDecision) === 'human'
  ) {
    return 'human_certified_baseline';
  }
  if (founderBaseline) return 'candidate_pending_recertification';
  return state === 'working' || state === 'review_ready'
    ? 'never_human_certified'
    : 'machine_certified_live';
}

function tasteInboxCard(
  packet: CertificationReviewPacket,
  digest: string,
  state: CertificationState
): CertificationTasteInboxCard | null {
  if (state !== 'review_ready') return null;
  return {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    decisionEvidenceDigest: digest,
    excludedOperationalTiers: CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
    state: 'review_ready',
    subject: packet.subject,
  };
}

function auditEvent(
  type: CertificationAuditEvent['type'],
  packet: CertificationReviewPacket,
  evidenceDigest: string | null,
  summary: string,
  at: string
): CertificationAuditEvent {
  return {
    at,
    evidenceDigest,
    subjectId: packet.subject.id,
    summary,
    type,
  };
}

function stateRank(state: CertificationState): number {
  return CERTIFICATION_STATES.indexOf(state);
}

function maxAdmittedState(
  packet: CertificationReviewPacket,
  currentDecision: FounderCertificationDecision | null,
  blockers: readonly CertificationBlocker[]
): CertificationState {
  if (blockers.length > 0) return 'working';
  if (!currentDecision) return 'review_ready';
  if (currentDecision.decision !== 'approved') return 'working';

  const shippedBlockers = [
    ...requireOperationalTier(packet, 'ci'),
    ...requireOperationalTier(packet, 'queue_merge'),
    ...requireOperationalTier(packet, 'deploy'),
  ];
  if (shippedBlockers.length > 0) return 'founder_locked';

  const monitoredBlockers = requireOperationalTier(packet, 'runtime_dogfood');
  if (monitoredBlockers.length > 0) return 'shipped';
  return 'monitored';
}

function blockersForRequestedState(
  packet: CertificationReviewPacket,
  requestedState: CertificationState | null,
  admittedState: CertificationState,
  blockers: readonly CertificationBlocker[]
): CertificationBlocker[] {
  if (
    !requestedState ||
    stateRank(requestedState) <= stateRank(admittedState)
  ) {
    return [];
  }

  if (blockers.length > 0) return [...blockers];

  const requestedBlockers: CertificationBlocker[] = [];
  if (stateRank(requestedState) >= stateRank('shipped')) {
    requestedBlockers.push(
      ...requireOperationalTier(packet, 'ci'),
      ...requireOperationalTier(packet, 'queue_merge'),
      ...requireOperationalTier(packet, 'deploy')
    );
  }
  if (stateRank(requestedState) >= stateRank('monitored')) {
    requestedBlockers.push(
      ...requireOperationalTier(packet, 'runtime_dogfood')
    );
  }

  return requestedBlockers.length > 0
    ? requestedBlockers
    : [
        blocker(
          'founder_lock_stale',
          'state',
          requestedState,
          `Requested state ${requestedState} is not admitted.`
        ),
      ];
}

export function shouldEmitTasteInboxCard(state: CertificationState): boolean {
  return state === 'review_ready';
}

function admissionAuditType(
  blockers: readonly CertificationBlocker[],
  currentDecision: FounderCertificationDecision | null
): CertificationAuditEvent['type'] {
  if (blockers.length > 0) return 'review_packet_incomplete';
  if (currentDecision?.decision === 'approved') return 'founder_lock_valid';
  if (currentDecision?.decision === 'changes_requested') {
    return 'founder_feedback_returned';
  }
  if (currentDecision?.decision === 'rejected') return 'founder_rejected';
  return 'taste_card_emitted';
}

const ADMISSION_AUDIT_SUMMARIES = {
  founder_feedback_returned:
    'Founder feedback returns certification to working.',
  founder_lock_stale:
    'Prior founder lock does not match the current decision digest.',
  founder_lock_valid:
    'Founder decision is bound to the current evidence digest.',
  founder_rejected: 'Founder rejection returns certification to working.',
  review_packet_incomplete:
    'Certification packet failed closed before founder review.',
  taste_card_emitted: 'Review-ready packet creates one Inbox decision.',
  transition_allowed: 'Requested state is admitted.',
  transition_blocked: 'Requested state is blocked.',
} as const satisfies Record<CertificationAuditEvent['type'], string>;

function admissionAuditSummary(type: CertificationAuditEvent['type']): string {
  return ADMISSION_AUDIT_SUMMARIES[type];
}

function admissionAuditHistory({
  packet,
  digest,
  blockers,
  currentDecision,
  staleFounderLock,
  requestedState,
  transitionAllowed,
  evaluatedAt,
}: {
  readonly packet: CertificationReviewPacket;
  readonly digest: string | null;
  readonly blockers: readonly CertificationBlocker[];
  readonly currentDecision: FounderCertificationDecision | null;
  readonly staleFounderLock: FounderCertificationDecision | null;
  readonly requestedState: CertificationState | null;
  readonly transitionAllowed: boolean;
  readonly evaluatedAt: string;
}): CertificationAuditEvent[] {
  const type = admissionAuditType(blockers, currentDecision);
  const auditHistory = [
    auditEvent(type, packet, digest, admissionAuditSummary(type), evaluatedAt),
  ];

  if (staleFounderLock) {
    auditHistory.push(
      auditEvent(
        'founder_lock_stale',
        packet,
        digest,
        admissionAuditSummary('founder_lock_stale'),
        evaluatedAt
      )
    );
  }

  if (requestedState) {
    const transitionType = transitionAllowed
      ? 'transition_allowed'
      : 'transition_blocked';
    auditHistory.push(
      auditEvent(
        transitionType,
        packet,
        digest,
        transitionAllowed
          ? `Requested state ${requestedState} is admitted.`
          : `Requested state ${requestedState} is blocked.`,
        evaluatedAt
      )
    );
  }

  return auditHistory;
}

export function evaluateCertificationAdmission({
  packet,
  decisions = [],
  requestedState = null,
  evaluatedAt = new Date().toISOString(),
}: EvaluateCertificationAdmissionInput): CertificationAdmission {
  const tasteBlockers = collectTasteBlockers(packet);
  const digest =
    packet.contract === JOVIE_CERTIFICATION_CONTRACT
      ? buildCertificationDecisionDigest(packet)
      : null;
  const decisionBlockers = digest
    ? collectDecisionBlockers(digest, decisions)
    : [];
  const blockers = [...tasteBlockers, ...decisionBlockers];
  const currentDecision = digest
    ? findCurrentDecision(digest, decisions)
    : null;
  const staleFounderLock = digest
    ? findStaleFounderLock(packet, digest, decisions)
    : null;
  const founderBaseline = digest
    ? findFounderBaseline(packet, decisions)
    : null;
  const state = maxAdmittedState(packet, currentDecision, blockers);
  const baselineStatus = evaluateBaselineStatus({
    currentDecision,
    founderBaseline,
    state,
  });
  const requestedBlockers = blockersForRequestedState(
    packet,
    requestedState,
    state,
    blockers
  );
  const transitionAllowed =
    requestedState === null || stateRank(requestedState) <= stateRank(state);

  return {
    baselineStatus,
    blockers,
    contract: JOVIE_CERTIFICATION_CONTRACT,
    currentDecision,
    decisionEvidenceDigest: digest,
    founderBaseline,
    staleFounderLock,
    state,
    tasteInboxCard: digest ? tasteInboxCard(packet, digest, state) : null,
    transition: {
      admittedState: state,
      allowed: transitionAllowed,
      blockers: requestedBlockers,
      requestedState,
    },
    auditHistory: admissionAuditHistory({
      packet,
      digest,
      blockers,
      currentDecision,
      staleFounderLock,
      requestedState,
      transitionAllowed,
      evaluatedAt,
    }),
  };
}

export function recordFounderCertificationDecision(
  input: RecordFounderCertificationDecisionInput
): RecordFounderCertificationDecisionResult {
  const {
    packet,
    existingDecisions = [],
    decision,
    decidedAt = new Date().toISOString(),
  } = input;
  const admission = evaluateCertificationAdmission({
    packet,
    decisions: existingDecisions,
    evaluatedAt: decidedAt,
  });

  if (
    admission.decisionEvidenceDigest &&
    existingDecisions.some(
      existing =>
        existing.evidenceDigest === admission.decisionEvidenceDigest ||
        existing.id === decision.id
    )
  ) {
    return {
      admission,
      blockers: [
        blocker(
          'duplicate_founder_decision',
          'decision',
          admission.decisionEvidenceDigest,
          'Decision digest or decision id has already been recorded.'
        ),
      ],
      ok: false,
      reason: 'duplicate_founder_decision',
    };
  }

  if (admission.state !== 'review_ready' || !admission.decisionEvidenceDigest) {
    return {
      admission,
      blockers: admission.blockers,
      ok: false,
      reason: 'packet_not_review_ready',
    };
  }

  if (decision.evidenceDigest !== admission.decisionEvidenceDigest) {
    return {
      admission,
      blockers: [
        blocker(
          'evidence_source_sha_mismatch',
          'decision',
          decision.id,
          'Founder decision digest does not match the review packet digest.'
        ),
      ],
      ok: false,
      reason: 'decision_digest_mismatch',
    };
  }

  const recordedDecision: FounderCertificationDecision = {
    ...decision,
    decidedAt: decision.decidedAt || decidedAt,
    evidenceDigest: admission.decisionEvidenceDigest,
    subjectId: packet.subject.id,
  };
  const decisions = [...existingDecisions, recordedDecision];

  return {
    admission: evaluateCertificationAdmission({
      packet,
      decisions,
      evaluatedAt: decidedAt,
    }),
    decision: recordedDecision,
    decisions,
    ok: true,
  };
}

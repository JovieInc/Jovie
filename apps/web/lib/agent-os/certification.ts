import { createHash } from 'node:crypto';

export const JOVIE_CERTIFICATION_CONTRACT = 'jovie.certification/v1' as const;

export const CERTIFICATION_STATES = [
  'working',
  'review_ready',
  'founder_locked',
  'shipped',
  'monitored',
] as const;

export type CertificationState = (typeof CERTIFICATION_STATES)[number];

export const CERTIFICATION_TASTE_EVIDENCE_TIERS = [
  'canonical_source',
  'invariant_evaluation',
  'tests_coverage',
  'visual_proof',
  'canonical_references',
  'required_variants',
] as const;

export const CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS = [
  'ci',
  'queue_merge',
  'deploy',
  'runtime_dogfood',
] as const;

export type CertificationTasteEvidenceTier =
  (typeof CERTIFICATION_TASTE_EVIDENCE_TIERS)[number];
export type CertificationOperationalEvidenceTier =
  (typeof CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS)[number];
export type CertificationEvidenceTier =
  | CertificationTasteEvidenceTier
  | CertificationOperationalEvidenceTier;

export type CertificationEvidenceStatus =
  | 'missing'
  | 'pending'
  | 'passed'
  | 'failed'
  | 'blocked';

export type FounderCertificationDecisionKind =
  | 'approved'
  | 'changes_requested'
  | 'rejected';

/**
 * Who certified a decision. Absent means 'human' — every decision recorded
 * before this field existed was a founder/human call, and every existing
 * caller keeps that behavior unless it explicitly opts a decision into
 * 'machine'. Only a 'machine' authority can move a never-certified subject
 * forward without ever establishing the protected founder baseline
 * (JOV-6947); it can never retroactively become that baseline.
 */
export const CERTIFICATION_CERTIFIER_AUTHORITIES = [
  'human',
  'machine',
] as const;
export type CertificationCertifierAuthority =
  (typeof CERTIFICATION_CERTIFIER_AUTHORITIES)[number];

export type CertificationBlockerCode =
  | 'contract_mismatch'
  | 'source_missing'
  | 'source_sha_mismatch'
  | 'source_path_missing'
  | 'canonical_reference_missing'
  | 'canonical_reference_failed'
  | 'pen_round_trip_missing'
  | 'pen_round_trip_failed'
  | 'invariant_evaluation_missing'
  | 'invariant_evaluation_failed'
  | 'tests_coverage_missing'
  | 'tests_coverage_failed'
  | 'visual_proof_missing'
  | 'visual_proof_failed'
  | 'required_variant_missing'
  | 'required_variant_failed'
  | 'required_media_missing'
  | 'required_media_failed'
  | 'evidence_source_sha_mismatch'
  | 'duplicate_founder_decision'
  | 'founder_feedback_returned'
  | 'founder_rejected'
  | 'founder_lock_stale'
  | 'ci_missing'
  | 'ci_failed'
  | 'queue_merge_missing'
  | 'queue_merge_failed'
  | 'deploy_missing'
  | 'deploy_failed'
  | 'runtime_dogfood_missing'
  | 'runtime_dogfood_failed';

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

export interface CertificationSubject {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
}

export interface CertificationSourceReceipt {
  readonly repository: string;
  readonly ref: string;
  readonly sha: string;
  readonly expectedSha?: string | null;
  readonly paths: readonly string[];
  readonly digest?: string | null;
}

/** Exact approved editable authority and the rendered state handed to implementers. */
export interface ApprovedPenReference {
  readonly artifact: string;
  readonly frameId: string;
  readonly revision: string;
  readonly penDigest: string;
  readonly renderedRef: string;
  readonly renderedDigest: string;
  readonly route: string;
  readonly fixture: string;
  readonly viewport: string;
  readonly theme: string;
  readonly interactionState: string;
  readonly designSystemRevision: string;
}

export interface PenRoundTripComparison {
  readonly referenceReceiptId: string;
  readonly reference: ApprovedPenReference;
  readonly deploymentReceiptId: string;
  readonly productionRenderRef: string;
  readonly productionRenderDigest: string;
  readonly diffRef: string;
  readonly diffDigest: string;
  readonly changedPixels: number;
  readonly geometryPassed: boolean;
  readonly tokensPassed: boolean;
  readonly unexplainedMaterialDiffs: number;
  /** Every nonzero raster residual needs a scoped tolerance and visual judgment. */
  readonly residuals: readonly {
    readonly maskOrTolerance: string;
    readonly rationale: string;
    readonly judgmentReceiptId: string;
  }[];
}

export function isApprovedPenReference(
  value: unknown
): value is ApprovedPenReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    [
      'artifact',
      'frameId',
      'revision',
      'penDigest',
      'renderedRef',
      'renderedDigest',
      'route',
      'fixture',
      'viewport',
      'theme',
      'interactionState',
      'designSystemRevision',
    ].every(
      key =>
        typeof record[key] === 'string' &&
        (record[key] as string).trim().length > 0
    ) &&
    /^sha256:[a-f0-9]{64}$/.test(String(record.penDigest)) &&
    /^sha256:[a-f0-9]{64}$/.test(String(record.renderedDigest))
  );
}

export function isPenRoundTripComparison(
  value: unknown
): value is PenRoundTripComparison {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    isApprovedPenReference(record.reference) &&
    [
      'referenceReceiptId',
      'deploymentReceiptId',
      'productionRenderRef',
      'productionRenderDigest',
      'diffRef',
      'diffDigest',
    ].every(
      key =>
        typeof record[key] === 'string' &&
        (record[key] as string).trim().length > 0
    ) &&
    /^sha256:[a-f0-9]{64}$/.test(String(record.productionRenderDigest)) &&
    /^sha256:[a-f0-9]{64}$/.test(String(record.diffDigest)) &&
    Number.isSafeInteger(record.changedPixels) &&
    Number(record.changedPixels) >= 0 &&
    typeof record.geometryPassed === 'boolean' &&
    typeof record.tokensPassed === 'boolean' &&
    Number.isSafeInteger(record.unexplainedMaterialDiffs) &&
    Number(record.unexplainedMaterialDiffs) >= 0 &&
    Array.isArray(record.residuals) &&
    record.residuals.every(
      residual =>
        residual &&
        typeof residual === 'object' &&
        !Array.isArray(residual) &&
        ['maskOrTolerance', 'rationale', 'judgmentReceiptId'].every(
          key =>
            typeof residual[key] === 'string' && residual[key].trim().length > 0
        )
    )
  );
}

export interface CertificationEvidenceReceipt {
  readonly id: string;
  readonly tier: CertificationEvidenceTier;
  readonly status: CertificationEvidenceStatus;
  readonly sourceSha: string | null;
  readonly ref: string;
  readonly digest: string | null;
  readonly summary: string;
  readonly approvedPenReference?: ApprovedPenReference;
  readonly penRoundTrip?: PenRoundTripComparison;
  readonly penResidualJudgment?: Pick<
    PenRoundTripComparison,
    'referenceReceiptId' | 'reference' | 'productionRenderDigest' | 'diffDigest'
  >;
}

export interface CertificationRequiredVariant {
  readonly id: string;
  readonly label: string;
  readonly sourceSha: string;
  readonly proof: CertificationEvidenceReceipt | null;
  readonly requiredMediaIds: readonly string[];
}

export interface CertificationItemMediaReceipt {
  readonly id: string;
  readonly itemId: string;
  readonly variantId: string | null;
  readonly status: CertificationEvidenceStatus;
  readonly sourceSha: string | null;
  readonly ref: string;
  readonly digest: string | null;
  readonly summary: string;
}

export interface CertificationOperationalEvidence {
  readonly ci?: readonly CertificationEvidenceReceipt[];
  readonly queueMerge?: readonly CertificationEvidenceReceipt[];
  readonly deploy?: readonly CertificationEvidenceReceipt[];
  readonly runtimeDogfood?: readonly CertificationEvidenceReceipt[];
}

export interface CertificationReviewPacket {
  readonly contract: string;
  readonly subject: CertificationSubject;
  readonly source: CertificationSourceReceipt | null;
  readonly canonicalReferences: readonly CertificationEvidenceReceipt[];
  readonly invariantEvaluation: readonly CertificationEvidenceReceipt[];
  readonly testsCoverage: readonly CertificationEvidenceReceipt[];
  readonly visualProof: readonly CertificationEvidenceReceipt[];
  readonly requiredVariants: readonly CertificationRequiredVariant[];
  readonly itemMedia: readonly CertificationItemMediaReceipt[];
  readonly operational?: CertificationOperationalEvidence;
}

export interface FounderCertificationDecision {
  readonly id: string;
  readonly subjectId: string;
  readonly evidenceDigest: string;
  readonly decision: FounderCertificationDecisionKind;
  readonly decidedAt: string;
  readonly reviewer: string;
  readonly notes: string | null;
  /** Defaults to 'human' when omitted. See {@link CertificationCertifierAuthority}. */
  readonly certifierAuthority?: CertificationCertifierAuthority;
}

export interface CertificationAuditEvent {
  readonly at: string;
  readonly type:
    | 'review_packet_incomplete'
    | 'taste_card_emitted'
    | 'founder_lock_valid'
    | 'founder_lock_stale'
    | 'founder_feedback_returned'
    | 'founder_rejected'
    | 'transition_blocked'
    | 'transition_allowed';
  readonly subjectId: string;
  readonly evidenceDigest: string | null;
  readonly summary: string;
}

export interface CertificationBlocker {
  readonly code: CertificationBlockerCode;
  readonly tier: CertificationEvidenceTier | 'decision' | 'state';
  readonly id: string;
  readonly summary: string;
}

export interface CertificationTasteInboxCard {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly state: 'review_ready';
  readonly subject: CertificationSubject;
  readonly decisionEvidenceDigest: string;
  readonly excludedOperationalTiers: readonly CertificationOperationalEvidenceTier[];
}

export interface CertificationTransitionResult {
  readonly requestedState: CertificationState | null;
  readonly allowed: boolean;
  readonly admittedState: CertificationState;
  readonly blockers: readonly CertificationBlocker[];
}

/**
 * JOV-6947: distinguishes a subject that has never had a human certification
 * from one that is currently live on machine evidence alone, one whose
 * current evidence digest *is* the founder-approved baseline, and one whose
 * evidence has moved on since a founder baseline was established. Derived
 * every evaluation from the same decisions ledger `evaluateCertificationAdmission`
 * already consumes — this is not a second certification store.
 */
export const CERTIFICATION_BASELINE_STATUSES = [
  'never_human_certified',
  'machine_certified_live',
  'human_certified_baseline',
  'candidate_pending_recertification',
] as const;
export type CertificationBaselineStatus =
  (typeof CERTIFICATION_BASELINE_STATUSES)[number];

export interface CertificationAdmission {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly state: CertificationState;
  readonly decisionEvidenceDigest: string | null;
  readonly tasteInboxCard: CertificationTasteInboxCard | null;
  readonly blockers: readonly CertificationBlocker[];
  readonly staleFounderLock: FounderCertificationDecision | null;
  readonly currentDecision: FounderCertificationDecision | null;
  /**
   * The most recent human-authority 'approved' decision for this subject,
   * at any past evidence digest — the protected canonical baseline once one
   * exists. Null until a human certifies this subject for the first time.
   */
  readonly founderBaseline: FounderCertificationDecision | null;
  readonly baselineStatus: CertificationBaselineStatus;
  readonly transition: CertificationTransitionResult;
  readonly auditHistory: readonly CertificationAuditEvent[];
}

export interface EvaluateCertificationAdmissionInput {
  readonly packet: CertificationReviewPacket;
  readonly decisions?: readonly FounderCertificationDecision[];
  readonly requestedState?: CertificationState | null;
  readonly evaluatedAt?: string;
}

export interface RecordFounderCertificationDecisionInput {
  readonly packet: CertificationReviewPacket;
  readonly existingDecisions?: readonly FounderCertificationDecision[];
  readonly decision: Omit<
    FounderCertificationDecision,
    'decidedAt' | 'subjectId' | 'evidenceDigest'
  > & {
    readonly decidedAt?: string;
    readonly evidenceDigest: string;
  };
  readonly decidedAt?: string;
}

export type RecordFounderCertificationDecisionResult =
  | {
      readonly ok: true;
      readonly decision: FounderCertificationDecision;
      readonly decisions: readonly FounderCertificationDecision[];
      readonly admission: CertificationAdmission;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'packet_not_review_ready'
        | 'decision_digest_mismatch'
        | 'duplicate_founder_decision';
      readonly admission: CertificationAdmission;
      readonly blockers: readonly CertificationBlocker[];
    };

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
  return `sha256:${createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex')}`;
}

function receiptDigestInput(
  receipt: CertificationEvidenceReceipt
): StableObject {
  return {
    ...(receipt.approvedPenReference
      ? {
          approvedPenReference: JSON.parse(
            JSON.stringify(receipt.approvedPenReference)
          ) as StableValue,
        }
      : {}),
    ...(receipt.penRoundTrip
      ? {
          penRoundTrip: JSON.parse(
            JSON.stringify(receipt.penRoundTrip)
          ) as StableValue,
        }
      : {}),
    ...(receipt.penResidualJudgment
      ? {
          penResidualJudgment: JSON.parse(
            JSON.stringify(receipt.penResidualJudgment)
          ) as StableValue,
        }
      : {}),
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

/** Admission enforcement, not a pixel producer: receipts must come from existing producers. */
function collectPenRoundTripBlockers(
  packet: CertificationReviewPacket
): CertificationBlocker[] {
  const failures: CertificationBlocker[] = [];
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0;
  const digest = (value: unknown) =>
    typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
  for (const referenceReceipt of packet.canonicalReferences) {
    const reference = referenceReceipt.approvedPenReference;
    if (!reference && !/(?:^pen:|\.pen(?:$|[#?]))/.test(referenceReceipt.ref))
      continue;
    const fail = (summary: string, missing = false) =>
      failures.push(
        blocker(
          missing ? 'pen_round_trip_missing' : 'pen_round_trip_failed',
          'visual_proof',
          referenceReceipt.id,
          summary
        )
      );
    if (!isApprovedPenReference(reference)) {
      fail(
        'Approved Pen authority must include editable identity, exact revision/hash and rendered state.',
        true
      );
      continue;
    }
    if (
      referenceReceipt.digest !== reference.penDigest ||
      referenceReceipt.ref !== reference.artifact
    )
      fail(
        'Canonical Pen receipt must bind the approved artifact and exact source digest.'
      );
    const matches = packet.visualProof.filter(
      receipt =>
        receipt.penRoundTrip?.referenceReceiptId === referenceReceipt.id
    );
    if (matches.length !== 1) {
      fail(
        'Exactly one comparison against the approved Pen reference is required.',
        true
      );
      continue;
    }
    const visual = matches[0];
    const comparison = visual.penRoundTrip;
    if (!isPenRoundTripComparison(comparison)) {
      fail(
        'Pen comparison has malformed binding, measurements or residual disposition.'
      );
      continue;
    }
    if (
      stableSerialize(comparison.reference as unknown as StableValue) !==
      stableSerialize(reference as unknown as StableValue)
    )
      fail(
        'Pen comparison is stale or bound to a different revision, fixture, viewport or state.'
      );
    if (
      visual.tier !== 'visual_proof' ||
      visual.status !== 'passed' ||
      visual.ref !== comparison.productionRenderRef ||
      visual.digest !== comparison.productionRenderDigest ||
      visual.sourceSha !== packet.source?.sha ||
      !comparison.geometryPassed ||
      !comparison.tokensPassed ||
      comparison.unexplainedMaterialDiffs !== 0 ||
      !text(comparison.productionRenderRef) ||
      !digest(comparison.productionRenderDigest) ||
      !text(comparison.diffRef)
    )
      fail(
        'Rendered geometry, tokens and zero unexplained material divergence must be proven at the exact source SHA.'
      );
    const deployments = (packet.operational?.deploy ?? []).filter(
      receipt => receipt.id === comparison.deploymentReceiptId
    );
    if (
      deployments.length !== 1 ||
      deployments[0].tier !== 'deploy' ||
      deployments[0].status !== 'passed' ||
      !text(deployments[0].ref) ||
      !digest(deployments[0].digest) ||
      deployments[0].sourceSha !== packet.source?.sha
    )
      fail(
        'Pen round trip requires one passed deployment receipt for the exact source SHA.'
      );
    if (comparison.changedPixels > 0 && comparison.residuals.length === 0)
      fail(
        'Nonzero pixel differences require explicit scoped residual disposition.'
      );
    for (const residual of comparison.residuals) {
      const judgments = packet.visualProof.filter(
        receipt =>
          receipt.id === residual.judgmentReceiptId && receipt !== visual
      );
      if (
        !text(residual.maskOrTolerance) ||
        !text(residual.rationale) ||
        judgments.length !== 1 ||
        stableSerialize(
          judgments[0].penResidualJudgment as unknown as StableValue
        ) !==
          stableSerialize({
            referenceReceiptId: comparison.referenceReceiptId,
            reference,
            productionRenderDigest: comparison.productionRenderDigest,
            diffDigest: comparison.diffDigest,
          } as unknown as StableValue) ||
        judgments[0].tier !== 'visual_proof' ||
        judgments[0].status !== 'passed' ||
        judgments[0].ref !== comparison.diffRef ||
        judgments[0].digest !== comparison.diffDigest ||
        judgments[0].sourceSha !== packet.source?.sha
      )
        fail(
          'Each raster residual requires a mask/tolerance, rationale and separate exact-source visual judgment.'
        );
    }
  }
  return failures;
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
    ...collectPenRoundTripBlockers(packet),
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
  taste_card_emitted: 'Review-ready packet emits one Taste Inbox card.',
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

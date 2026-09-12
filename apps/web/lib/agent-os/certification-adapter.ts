import { createHash } from 'node:crypto';

import type { MarketingRegistryEntry } from '@/data/marketing/componentRegistry';
import {
  CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
  CERTIFICATION_TASTE_EVIDENCE_TIERS,
  type CertificationAdmission,
  type CertificationAuditEvent,
  type CertificationBlocker,
  type CertificationEvidenceReceipt,
  type CertificationEvidenceTier,
  type CertificationReviewPacket,
  type CertificationTasteInboxCard,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
  JOVIE_CERTIFICATION_CONTRACT,
  type RecordFounderCertificationDecisionInput,
  type RecordFounderCertificationDecisionResult,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';

export const MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION = 1 as const;
export const MARKETING_CERTIFICATION_STORE_KEY =
  'jovie:certification:v1:marketing-components' as const;

const PERSISTENCE_TTL_SECONDS = 315_576_000;
const MAX_COMPARE_AND_SET_ATTEMPTS = 5;

export interface CertificationRecordBackend {
  get(key: string): Promise<unknown>;
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string,
    ttlSeconds: number
  ): Promise<boolean>;
}

export interface MarketingCertificationRecord {
  readonly identityId: string;
  readonly packet: CertificationReviewPacket;
  readonly packetUpdatedAt: string;
  readonly decisions: readonly FounderCertificationDecision[];
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
}

export interface MarketingCertificationLedger {
  readonly schemaVersion: typeof MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly registryIds: readonly string[];
  readonly records: Readonly<Record<string, MarketingCertificationRecord>>;
}

export interface MarketingCertificationProjectionRow {
  readonly identityId: string;
  readonly registryKind: MarketingRegistryEntry['kind'];
  readonly sourceBacked: boolean;
  readonly resolvedSource: string | null;
  readonly packet: CertificationReviewPacket;
  readonly packetUpdatedAt: string;
  readonly decisions: readonly FounderCertificationDecision[];
  readonly admission: CertificationAdmission;
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
}

export const MARKETING_MANDATORY_ASSURANCE_DIMENSIONS = [
  'security',
  'integrity',
  'accessibility',
  'correctness',
] as const;

export type MarketingMandatoryAssuranceDimension =
  (typeof MARKETING_MANDATORY_ASSURANCE_DIMENSIONS)[number];

export type MarketingAssurancePrerequisiteKind =
  | MarketingMandatoryAssuranceDimension
  | 'written_invariant'
  | 'skill_version'
  | 'prior_feedback_pr_disposition'
  | 'landed_coverage_enforcement'
  | 'exact_build_render'
  | 'independent_review'
  | 'pro_review_custody'
  | 'public_page_quality_floor';

export interface MarketingAssuranceEvidenceBinding {
  readonly receiptId: string;
  readonly tier: CertificationEvidenceTier;
  /** Exact immutable evidence reference expected from the trusted producer. */
  readonly expectedRef: string;
  /** The real test, evaluator, or producer selector represented by the receipt. */
  readonly selector: string;
}

export interface MarketingMandatoryAssuranceRequirement {
  readonly id: string;
  readonly kind: MarketingAssurancePrerequisiteKind;
  readonly evidence: MarketingAssuranceEvidenceBinding;
  readonly publicPageScoreFloor?: 97;
}

export interface MarketingAssuranceNotApplicableDisposition {
  readonly dimension: MarketingMandatoryAssuranceDimension;
  readonly rationale: string;
}

export interface MarketingOptionalParityRequirement {
  readonly id: string;
  readonly desiredOutcome: string;
  readonly evidence?: MarketingAssuranceEvidenceBinding;
  readonly publicPageScoreTarget?: 100;
  readonly economics: {
    readonly expectedRoi: string;
    readonly totalOwnershipCost: string;
    readonly confidence: string;
    readonly displacedWork: string;
    readonly measuredTrigger: string;
  };
}

/**
 * Adapter-owned expected-evidence map for one canonical registry identity.
 * The profile is not a second component registry: subject identity still comes
 * from MARKETING_COMPONENT_REGISTRY, and provenance must itself be represented
 * by a canonical-reference receipt inside the reviewed packet digest.
 */
export interface MarketingAssuranceProfile {
  readonly subjectId: string;
  readonly version: string;
  /** Digest of this exact profile, excluding only this field. */
  readonly profileDigest: string;
  readonly provenance: MarketingAssuranceEvidenceBinding;
  readonly mandatory: readonly MarketingMandatoryAssuranceRequirement[];
  readonly notApplicable: readonly MarketingAssuranceNotApplicableDisposition[];
  readonly optionalParity: readonly MarketingOptionalParityRequirement[];
}

export type MarketingAssuranceBlockerCode =
  | 'assurance_profile_missing'
  | 'assurance_profile_digest_mismatch'
  | 'assurance_receipt_missing'
  | 'assurance_receipt_ambiguous'
  | 'assurance_receipt_failed'
  | 'assurance_receipt_ref_mismatch'
  | 'assurance_receipt_source_mismatch';

export interface MarketingAssuranceBlocker {
  readonly code: MarketingAssuranceBlockerCode;
  readonly requirementId: string;
  readonly summary: string;
}

export interface MarketingOptionalParityAdvisory {
  readonly requirementId: string;
  readonly status: 'evidenced' | 'unproven';
  readonly summary: string;
}

export interface MarketingAssuranceEvaluation {
  readonly subjectId: string;
  readonly status: 'qualified' | 'unqualified';
  readonly blockers: readonly MarketingAssuranceBlocker[];
  readonly optionalParity: readonly MarketingOptionalParityAdvisory[];
}

export type MarketingRecordFounderDecisionResult =
  | (RecordFounderCertificationDecisionResult & {
      readonly assurance: MarketingAssuranceEvaluation;
    })
  | {
      readonly ok: false;
      readonly reason: 'assurance_unqualified';
      readonly admission: CertificationAdmission;
      readonly blockers: readonly CertificationBlocker[];
      readonly assurance: MarketingAssuranceEvaluation;
    };

export interface MarketingCertificationLedgerProjection {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly registryIds: readonly string[];
  readonly rows: readonly MarketingCertificationProjectionRow[];
}

export type MarketingReviewReadyWithheldReason =
  | 'existing_review_slot_occupied'
  | 'max_one_arbitration'
  | 'assurance_unqualified';

export interface MarketingReviewReadyProjection {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly existingEntryId: string | null;
  readonly selected: CertificationTasteInboxCard | null;
  readonly eligibleSubjectIds: readonly string[];
  readonly assurance: readonly MarketingAssuranceEvaluation[];
  readonly withheld: readonly {
    readonly subjectId: string;
    readonly reason: MarketingReviewReadyWithheldReason;
  }[];
}

export class MarketingCertificationRegistryDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingCertificationRegistryDriftError';
  }
}

export class MarketingCertificationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingCertificationPersistenceError';
  }
}

export class MarketingCertificationAssuranceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingCertificationAssuranceError';
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function registryIds(entries: readonly MarketingRegistryEntry[]): string[] {
  const ids = entries.map(entry => entry.id);
  if (uniqueSorted(ids).length !== ids.length) {
    throw new MarketingCertificationRegistryDriftError(
      'Marketing certification registry contains duplicate identities.'
    );
  }
  return ids;
}

function missingPacketForEntry(
  entry: MarketingRegistryEntry
): CertificationReviewPacket {
  return {
    canonicalReferences: [],
    contract: JOVIE_CERTIFICATION_CONTRACT,
    invariantEvaluation: [],
    itemMedia: [],
    operational: {},
    requiredVariants: [],
    source: null,
    subject: {
      id: entry.id,
      kind: `marketing-${entry.kind}`,
      title: entry.storybookTitle,
    },
    testsCoverage: [],
    visualProof: [],
  };
}

function initialLedger(
  entries: readonly MarketingRegistryEntry[],
  initializedAt: string
): MarketingCertificationLedger {
  const ids = registryIds(entries);
  return {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    records: Object.fromEntries(
      entries.map(entry => [
        entry.id,
        {
          auditHistory: [],
          decisions: [],
          identityId: entry.id,
          packet: missingPacketForEntry(entry),
          packetUpdatedAt: initializedAt,
          updatedAt: initializedAt,
        },
      ])
    ),
    registryIds: ids,
    schemaVersion: MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const FOUNDER_DECISIONS = new Set([
  'approved',
  'changes_requested',
  'rejected',
]);
const AUDIT_EVENT_TYPES = new Set([
  'review_packet_incomplete',
  'taste_card_emitted',
  'founder_lock_valid',
  'founder_lock_stale',
  'founder_feedback_returned',
  'founder_rejected',
  'transition_blocked',
  'transition_allowed',
]);
const EVIDENCE_TIERS = new Set<string>([
  ...CERTIFICATION_TASTE_EVIDENCE_TIERS,
  ...CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
]);
const EVIDENCE_STATUSES = new Set<string>([
  'missing',
  'pending',
  'passed',
  'failed',
  'blocked',
]);
const ASSURANCE_PREREQUISITE_KINDS = new Set<string>([
  ...MARKETING_MANDATORY_ASSURANCE_DIMENSIONS,
  'written_invariant',
  'skill_version',
  'prior_feedback_pr_disposition',
  'landed_coverage_enforcement',
  'exact_build_render',
  'independent_review',
  'pro_review_custody',
  'public_page_quality_floor',
]);
const OPTIONAL_ECONOMICS_FIELDS = [
  'expectedRoi',
  'totalOwnershipCost',
  'confidence',
  'displacedWork',
  'measuredTrigger',
] as const;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export type AssuranceProfileDigestInput = Omit<
  MarketingAssuranceProfile,
  'profileDigest'
>;

function stableAssuranceValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableAssuranceValue(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${stableAssuranceValue(item)}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Content address used by the profile's canonical provenance receipt. */
export function buildMarketingAssuranceProfileDigest(
  profile: AssuranceProfileDigestInput
): string {
  return `sha256:${createHash('sha256')
    .update(stableAssuranceValue(profile))
    .digest('hex')}`;
}

function assertAssuranceEvidenceBinding(
  value: unknown,
  label: string
): asserts value is MarketingAssuranceEvidenceBinding {
  if (
    !isRecord(value) ||
    !hasText(value.receiptId) ||
    !hasText(value.tier) ||
    !EVIDENCE_TIERS.has(value.tier) ||
    !hasText(value.expectedRef) ||
    !hasText(value.selector)
  ) {
    throw new MarketingCertificationAssuranceError(
      `${label} must name one receipt, evidence tier, immutable reference, and exact selector.`
    );
  }
}

function assertAssuranceProfileShape(
  value: unknown
): asserts value is MarketingAssuranceProfile {
  if (
    !isRecord(value) ||
    !hasText(value.subjectId) ||
    !hasText(value.version) ||
    !hasText(value.profileDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.profileDigest) ||
    !Array.isArray(value.mandatory) ||
    !Array.isArray(value.notApplicable) ||
    !Array.isArray(value.optionalParity)
  ) {
    throw new MarketingCertificationAssuranceError(
      'Marketing assurance profile has an invalid runtime shape.'
    );
  }

  assertAssuranceEvidenceBinding(value.provenance, 'Profile provenance');
  if (value.provenance.tier !== 'canonical_references') {
    throw new MarketingCertificationAssuranceError(
      'Profile provenance must use a canonical_references receipt.'
    );
  }
  const requirementIds = new Set<string>();
  const receiptIds = new Set<string>([value.provenance.receiptId]);
  const dimensionCounts = new Map<MarketingMandatoryAssuranceDimension, number>(
    MARKETING_MANDATORY_ASSURANCE_DIMENSIONS.map(dimension => [dimension, 0])
  );

  for (const requirement of value.mandatory) {
    if (
      !isRecord(requirement) ||
      !hasText(requirement.id) ||
      !hasText(requirement.kind) ||
      !ASSURANCE_PREREQUISITE_KINDS.has(requirement.kind)
    ) {
      throw new MarketingCertificationAssuranceError(
        'Mandatory assurance requirements must have unique ids and supported kinds.'
      );
    }
    if (requirementIds.has(requirement.id)) {
      throw new MarketingCertificationAssuranceError(
        `Duplicate assurance requirement id ${requirement.id}.`
      );
    }
    requirementIds.add(requirement.id);
    assertAssuranceEvidenceBinding(
      requirement.evidence,
      `Mandatory assurance ${requirement.id}`
    );
    if (receiptIds.has(requirement.evidence.receiptId)) {
      throw new MarketingCertificationAssuranceError(
        `Assurance receipt ${requirement.evidence.receiptId} cannot satisfy more than one requirement.`
      );
    }
    receiptIds.add(requirement.evidence.receiptId);
    if (
      MARKETING_MANDATORY_ASSURANCE_DIMENSIONS.includes(
        requirement.kind as MarketingMandatoryAssuranceDimension
      )
    ) {
      const dimension =
        requirement.kind as MarketingMandatoryAssuranceDimension;
      dimensionCounts.set(dimension, (dimensionCounts.get(dimension) ?? 0) + 1);
    }
    if (
      requirement.kind === 'public_page_quality_floor' &&
      requirement.publicPageScoreFloor !== 97
    ) {
      throw new MarketingCertificationAssuranceError(
        'Mandatory public-page quality uses the approved 97-point floor.'
      );
    }
    if (
      requirement.kind !== 'public_page_quality_floor' &&
      requirement.publicPageScoreFloor !== undefined
    ) {
      throw new MarketingCertificationAssuranceError(
        'Only public_page_quality_floor may declare a public-page score floor.'
      );
    }
  }

  for (const disposition of value.notApplicable) {
    if (
      !isRecord(disposition) ||
      !MARKETING_MANDATORY_ASSURANCE_DIMENSIONS.includes(
        disposition.dimension as MarketingMandatoryAssuranceDimension
      ) ||
      !hasText(disposition.rationale)
    ) {
      throw new MarketingCertificationAssuranceError(
        'Not-applicable assurance dimensions require a supported dimension and rationale.'
      );
    }
    const dimension =
      disposition.dimension as MarketingMandatoryAssuranceDimension;
    dimensionCounts.set(dimension, (dimensionCounts.get(dimension) ?? 0) + 1);
  }

  for (const [dimension, count] of dimensionCounts) {
    if (count !== 1) {
      throw new MarketingCertificationAssuranceError(
        `Assurance dimension ${dimension} needs exactly one required or not-applicable disposition.`
      );
    }
  }

  for (const requirement of value.optionalParity) {
    if (
      !isRecord(requirement) ||
      !hasText(requirement.id) ||
      !hasText(requirement.desiredOutcome) ||
      !isRecord(requirement.economics)
    ) {
      throw new MarketingCertificationAssuranceError(
        'Optional parity requirements need an id, desired outcome, and economics.'
      );
    }
    if (requirementIds.has(requirement.id)) {
      throw new MarketingCertificationAssuranceError(
        `Duplicate assurance requirement id ${requirement.id}.`
      );
    }
    requirementIds.add(requirement.id);
    for (const field of OPTIONAL_ECONOMICS_FIELDS) {
      if (!hasText(requirement.economics[field])) {
        throw new MarketingCertificationAssuranceError(
          `Optional parity ${requirement.id} requires ${field}.`
        );
      }
    }
    if (
      requirement.publicPageScoreTarget !== undefined &&
      requirement.publicPageScoreTarget !== 100
    ) {
      throw new MarketingCertificationAssuranceError(
        'Optional public-page parity uses the approved 100-point target.'
      );
    }
    if (requirement.evidence !== undefined) {
      assertAssuranceEvidenceBinding(
        requirement.evidence,
        `Optional parity ${requirement.id}`
      );
      if (receiptIds.has(requirement.evidence.receiptId)) {
        throw new MarketingCertificationAssuranceError(
          `Assurance receipt ${requirement.evidence.receiptId} cannot satisfy more than one requirement.`
        );
      }
      receiptIds.add(requirement.evidence.receiptId);
    }
  }

  const { profileDigest, ...digestInput } = value;
  if (
    buildMarketingAssuranceProfileDigest(
      digestInput as AssuranceProfileDigestInput
    ) !== profileDigest
  ) {
    throw new MarketingCertificationAssuranceError(
      'Marketing assurance profile digest does not match its exact content.'
    );
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEvidenceReceipt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.tier === 'string' &&
    EVIDENCE_TIERS.has(value.tier) &&
    typeof value.status === 'string' &&
    EVIDENCE_STATUSES.has(value.status) &&
    isNullableString(value.sourceSha) &&
    typeof value.ref === 'string' &&
    isNullableString(value.digest) &&
    typeof value.summary === 'string'
  );
}

function packetEvidenceReceipts(
  packet: CertificationReviewPacket
): CertificationEvidenceReceipt[] {
  return [
    ...packet.canonicalReferences,
    ...packet.invariantEvaluation,
    ...packet.testsCoverage,
    ...packet.visualProof,
    ...packet.requiredVariants.flatMap(variant =>
      variant.proof ? [variant.proof] : []
    ),
    ...(packet.operational?.ci ?? []),
    ...(packet.operational?.queueMerge ?? []),
    ...(packet.operational?.deploy ?? []),
    ...(packet.operational?.runtimeDogfood ?? []),
  ];
}

function evaluateAssuranceBinding(
  packet: CertificationReviewPacket,
  requirementId: string,
  binding: MarketingAssuranceEvidenceBinding
): MarketingAssuranceBlocker[] {
  const matches = packetEvidenceReceipts(packet).filter(
    receipt => receipt.id === binding.receiptId && receipt.tier === binding.tier
  );
  if (matches.length === 0) {
    return [
      {
        code: 'assurance_receipt_missing',
        requirementId,
        summary: `${requirementId} is missing receipt ${binding.receiptId} from ${binding.selector}.`,
      },
    ];
  }
  if (matches.length !== 1) {
    return [
      {
        code: 'assurance_receipt_ambiguous',
        requirementId,
        summary: `${requirementId} has ${matches.length} receipts named ${binding.receiptId}; exactly one is required.`,
      },
    ];
  }

  const [receipt] = matches;
  if (
    receipt.status !== 'passed' ||
    !receipt.digest?.trim() ||
    !receipt.ref.trim()
  ) {
    return [
      {
        code: 'assurance_receipt_failed',
        requirementId,
        summary: `${requirementId} receipt ${binding.receiptId} is not passed with usable evidence.`,
      },
    ];
  }
  if (receipt.ref !== binding.expectedRef) {
    return [
      {
        code: 'assurance_receipt_ref_mismatch',
        requirementId,
        summary: `${requirementId} receipt ${binding.receiptId} does not match its mapped evidence reference.`,
      },
    ];
  }
  if (!packet.source || receipt.sourceSha !== packet.source.sha) {
    return [
      {
        code: 'assurance_receipt_source_mismatch',
        requirementId,
        summary: `${requirementId} receipt ${binding.receiptId} is not bound to the packet source.`,
      },
    ];
  }
  return [];
}

export function evaluateMarketingAssurance(
  packet: CertificationReviewPacket,
  profile: MarketingAssuranceProfile | undefined
): MarketingAssuranceEvaluation {
  if (!profile) {
    return {
      blockers: [
        {
          code: 'assurance_profile_missing',
          requirementId: 'assurance-profile',
          summary: `No assurance requirement mapping exists for ${packet.subject.id}.`,
        },
      ],
      optionalParity: [],
      status: 'unqualified',
      subjectId: packet.subject.id,
    };
  }
  assertAssuranceProfileShape(profile);
  if (profile.subjectId !== packet.subject.id) {
    throw new MarketingCertificationAssuranceError(
      `Assurance profile ${profile.subjectId} cannot evaluate ${packet.subject.id}.`
    );
  }

  const profileBlockers = evaluateAssuranceBinding(
    packet,
    `assurance-profile:${profile.version}`,
    profile.provenance
  );
  const profileReceipt = packetEvidenceReceipts(packet).find(
    receipt =>
      receipt.id === profile.provenance.receiptId &&
      receipt.tier === profile.provenance.tier
  );
  if (
    profileBlockers.length === 0 &&
    profileReceipt?.digest !== profile.profileDigest
  ) {
    profileBlockers.push({
      code: 'assurance_profile_digest_mismatch',
      requirementId: `assurance-profile:${profile.version}`,
      summary: `Assurance profile ${profile.subjectId}@${profile.version} is not bound to the packet's exact profile digest.`,
    });
  }

  const blockers = [
    ...profileBlockers,
    ...profile.mandatory.flatMap(requirement =>
      evaluateAssuranceBinding(packet, requirement.id, requirement.evidence)
    ),
  ];
  const optionalParity = profile.optionalParity.map(requirement => {
    const evidenced =
      requirement.evidence !== undefined &&
      evaluateAssuranceBinding(packet, requirement.id, requirement.evidence)
        .length === 0;
    return {
      requirementId: requirement.id,
      status: evidenced ? ('evidenced' as const) : ('unproven' as const),
      summary: evidenced
        ? `${requirement.desiredOutcome} has mapped evidence; prioritization remains advisory.`
        : `${requirement.desiredOutcome} remains an optional, trigger-based advisory.`,
    };
  });

  return {
    blockers,
    optionalParity,
    status: blockers.length === 0 ? 'qualified' : 'unqualified',
    subjectId: packet.subject.id,
  };
}

function assuranceProfilesBySubject(
  profiles: readonly MarketingAssuranceProfile[],
  entries: readonly MarketingRegistryEntry[]
): ReadonlyMap<string, MarketingAssuranceProfile> {
  if (!Array.isArray(profiles)) {
    throw new MarketingCertificationAssuranceError(
      'Assurance requirement mappings must be an array.'
    );
  }
  const registry = new Set(registryIds(entries));
  const result = new Map<string, MarketingAssuranceProfile>();
  for (const profile of profiles) {
    if (
      isRecord(profile) &&
      hasText(profile.subjectId) &&
      !registry.has(profile.subjectId)
    ) {
      throw new MarketingCertificationRegistryDriftError(
        `Unknown marketing assurance identity: ${profile.subjectId}`
      );
    }
    assertAssuranceProfileShape(profile);
    if (result.has(profile.subjectId)) {
      throw new MarketingCertificationAssuranceError(
        `Duplicate assurance profile for ${profile.subjectId}.`
      );
    }
    result.set(profile.subjectId, profile);
  }
  return result;
}

function isCertificationReviewPacket(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.contract !== 'string' ||
    !isRecord(value.subject) ||
    typeof value.subject.id !== 'string' ||
    typeof value.subject.kind !== 'string' ||
    typeof value.subject.title !== 'string' ||
    !Array.isArray(value.canonicalReferences) ||
    !value.canonicalReferences.every(isEvidenceReceipt) ||
    !Array.isArray(value.invariantEvaluation) ||
    !value.invariantEvaluation.every(isEvidenceReceipt) ||
    !Array.isArray(value.testsCoverage) ||
    !value.testsCoverage.every(isEvidenceReceipt) ||
    !Array.isArray(value.visualProof) ||
    !value.visualProof.every(isEvidenceReceipt) ||
    !Array.isArray(value.requiredVariants) ||
    !value.requiredVariants.every(
      variant =>
        isRecord(variant) &&
        typeof variant.id === 'string' &&
        variant.id.length > 0 &&
        typeof variant.label === 'string' &&
        typeof variant.sourceSha === 'string' &&
        (variant.proof === null || isEvidenceReceipt(variant.proof)) &&
        Array.isArray(variant.requiredMediaIds) &&
        variant.requiredMediaIds.every(id => typeof id === 'string')
    ) ||
    !Array.isArray(value.itemMedia) ||
    !value.itemMedia.every(
      media =>
        isRecord(media) &&
        typeof media.id === 'string' &&
        media.id.length > 0 &&
        typeof media.itemId === 'string' &&
        isNullableString(media.variantId) &&
        typeof media.status === 'string' &&
        EVIDENCE_STATUSES.has(media.status) &&
        isNullableString(media.sourceSha) &&
        typeof media.ref === 'string' &&
        isNullableString(media.digest) &&
        typeof media.summary === 'string'
    )
  ) {
    return false;
  }

  if (
    value.source !== null &&
    (!isRecord(value.source) ||
      typeof value.source.repository !== 'string' ||
      typeof value.source.ref !== 'string' ||
      typeof value.source.sha !== 'string' ||
      (value.source.expectedSha !== undefined &&
        !isNullableString(value.source.expectedSha)) ||
      !Array.isArray(value.source.paths) ||
      !value.source.paths.every(path => typeof path === 'string') ||
      (value.source.digest !== undefined &&
        !isNullableString(value.source.digest)))
  ) {
    return false;
  }

  if (value.operational === undefined) return true;
  if (!isRecord(value.operational)) return false;
  const operational = value.operational;
  return ['ci', 'queueMerge', 'deploy', 'runtimeDogfood'].every(key => {
    const receipts = operational[key];
    return (
      receipts === undefined ||
      (Array.isArray(receipts) && receipts.every(isEvidenceReceipt))
    );
  });
}

function isPersistedFounderDecision(
  value: unknown,
  subjectId: string
): value is FounderCertificationDecision {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.subjectId === subjectId &&
    typeof value.evidenceDigest === 'string' &&
    value.evidenceDigest.length > 0 &&
    typeof value.decision === 'string' &&
    FOUNDER_DECISIONS.has(value.decision) &&
    typeof value.decidedAt === 'string' &&
    !Number.isNaN(Date.parse(value.decidedAt)) &&
    typeof value.reviewer === 'string' &&
    value.reviewer.length > 0 &&
    (value.notes === null || typeof value.notes === 'string')
  );
}

function isPersistedAuditEvent(
  value: unknown,
  subjectId: string
): value is CertificationAuditEvent {
  return (
    isRecord(value) &&
    typeof value.at === 'string' &&
    !Number.isNaN(Date.parse(value.at)) &&
    typeof value.type === 'string' &&
    AUDIT_EVENT_TYPES.has(value.type) &&
    value.subjectId === subjectId &&
    (value.evidenceDigest === null ||
      typeof value.evidenceDigest === 'string') &&
    typeof value.summary === 'string'
  );
}

function parseLedger(raw: unknown): MarketingCertificationLedger {
  if (typeof raw !== 'string') {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger must be stored as one compare-and-set JSON string.'
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger contains invalid JSON.'
    );
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION ||
    value.contract !== JOVIE_CERTIFICATION_CONTRACT ||
    !Array.isArray(value.registryIds) ||
    !value.registryIds.every(id => typeof id === 'string') ||
    !isRecord(value.records)
  ) {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger envelope is invalid.'
    );
  }

  for (const id of value.registryIds) {
    const record = value.records[id];
    if (
      !isRecord(record) ||
      record.identityId !== id ||
      !isRecord(record.packet) ||
      typeof record.packetUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(record.packetUpdatedAt)) ||
      !Array.isArray(record.decisions) ||
      !Array.isArray(record.auditHistory) ||
      typeof record.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(record.updatedAt)) ||
      !record.decisions.every(decision =>
        isPersistedFounderDecision(decision, id)
      ) ||
      !record.auditHistory.every(event => isPersistedAuditEvent(event, id))
    ) {
      throw new MarketingCertificationPersistenceError(
        `Certification ledger record ${id} is invalid.`
      );
    }
  }

  return value as unknown as MarketingCertificationLedger;
}

function assertDenominator(
  ledger: MarketingCertificationLedger,
  entries: readonly MarketingRegistryEntry[]
): void {
  const expected = uniqueSorted(registryIds(entries));
  const stored = uniqueSorted(ledger.registryIds);
  const recordIds = uniqueSorted(Object.keys(ledger.records));
  if (
    stored.length !== ledger.registryIds.length ||
    JSON.stringify(stored) !== JSON.stringify(expected) ||
    JSON.stringify(recordIds) !== JSON.stringify(expected)
  ) {
    throw new MarketingCertificationRegistryDriftError(
      `Marketing certification denominator drifted: expected ${expected.length} identities, stored ${stored.length} registry ids and ${recordIds.length} records.`
    );
  }

  const decisionIds = new Set<string>();
  const evidenceDigests = new Set<string>();
  for (const record of Object.values(ledger.records)) {
    for (const decision of record.decisions) {
      if (
        decisionIds.has(decision.id) ||
        evidenceDigests.has(decision.evidenceDigest)
      ) {
        throw new MarketingCertificationPersistenceError(
          'Certification ledger contains a duplicate founder decision id or evidence digest.'
        );
      }
      decisionIds.add(decision.id);
      evidenceDigests.add(decision.evidenceDigest);
    }
  }
}

function assertPacketMatchesEntry(
  packet: CertificationReviewPacket,
  entry: MarketingRegistryEntry
): void {
  if (!isCertificationReviewPacket(packet)) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} has an invalid runtime shape.`
    );
  }
  if (
    packet.subject.id !== entry.id ||
    packet.subject.kind !== `marketing-${entry.kind}` ||
    packet.subject.title !== entry.storybookTitle
  ) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} does not match its canonical registry identity.`
    );
  }
  if (!packet.source) return;
  if (!entry.sourceBacked || !entry.resolvedSource) {
    throw new MarketingCertificationPersistenceError(
      `Registry identity ${entry.id} has no resolved canonical source.`
    );
  }
  if (!packet.source.paths.includes(entry.resolvedSource)) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} does not bind canonical source ${entry.resolvedSource}.`
    );
  }
}

function serializeLedger(ledger: MarketingCertificationLedger): string {
  return JSON.stringify(ledger);
}

function assertValidTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new MarketingCertificationPersistenceError(
      `${label} must be a valid timestamp.`
    );
  }
}

function laterTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function projectionRow(
  entry: MarketingRegistryEntry,
  record: MarketingCertificationRecord,
  evaluatedAt: string
): MarketingCertificationProjectionRow {
  let admission: CertificationAdmission;
  try {
    assertPacketMatchesEntry(record.packet, entry);
    admission = evaluateCertificationAdmission({
      decisions: record.decisions,
      evaluatedAt,
      packet: record.packet,
    });
  } catch {
    throw new MarketingCertificationPersistenceError(
      `Certification ledger record ${entry.id} cannot be evaluated.`
    );
  }

  return {
    admission,
    auditHistory: record.auditHistory,
    decisions: record.decisions,
    identityId: entry.id,
    packet: record.packet,
    packetUpdatedAt: record.packetUpdatedAt,
    registryKind: entry.kind,
    resolvedSource: entry.resolvedSource,
    sourceBacked: entry.sourceBacked,
    updatedAt: record.updatedAt,
  };
}

function assertLedgerMatchesRegistry(
  ledger: MarketingCertificationLedger,
  entries: readonly MarketingRegistryEntry[],
  evaluatedAt: string
): void {
  assertDenominator(ledger, entries);
  for (const entry of entries) {
    projectionRow(entry, ledger.records[entry.id], evaluatedAt);
  }
}

export class MarketingCertificationStore {
  private readonly entries: readonly MarketingRegistryEntry[];
  private readonly entryById: ReadonlyMap<string, MarketingRegistryEntry>;

  constructor(
    private readonly backend: CertificationRecordBackend,
    entries: readonly MarketingRegistryEntry[]
  ) {
    registryIds(entries);
    this.entries = [...entries];
    this.entryById = new Map(entries.map(entry => [entry.id, entry]));
  }

  async ingestPacket(
    packet: CertificationReviewPacket,
    evaluatedAt = new Date().toISOString()
  ): Promise<MarketingCertificationProjectionRow> {
    assertValidTimestamp(evaluatedAt, 'Packet evaluation time');
    const entry = this.entryById.get(packet.subject.id);
    if (!entry) {
      throw new MarketingCertificationRegistryDriftError(
        `Unknown marketing certification identity: ${packet.subject.id}`
      );
    }
    assertPacketMatchesEntry(packet, entry);

    return this.mutate(evaluatedAt, ledger => {
      const existing = ledger.records[entry.id];
      const isInitialPlaceholder =
        existing.packet.source === null &&
        existing.decisions.length === 0 &&
        existing.auditHistory.length === 0;
      if (
        !isInitialPlaceholder &&
        Date.parse(evaluatedAt) <= Date.parse(existing.packetUpdatedAt)
      ) {
        throw new MarketingCertificationPersistenceError(
          `Certification packet ${entry.id} is not newer than the persisted packet.`
        );
      }
      const admission = evaluateCertificationAdmission({
        decisions: existing.decisions,
        evaluatedAt,
        packet,
      });
      const nextRecord: MarketingCertificationRecord = {
        auditHistory: [...existing.auditHistory, ...admission.auditHistory],
        decisions: existing.decisions,
        identityId: entry.id,
        packet,
        packetUpdatedAt: evaluatedAt,
        updatedAt: laterTimestamp(existing.updatedAt, evaluatedAt),
      };
      const nextLedger = {
        ...ledger,
        records: { ...ledger.records, [entry.id]: nextRecord },
      };
      return {
        ledger: nextLedger,
        result: projectionRow(entry, nextRecord, evaluatedAt),
      };
    });
  }

  async recordFounderDecision(input: {
    readonly subjectId: string;
    readonly assuranceProfile: MarketingAssuranceProfile;
    readonly decision: Omit<
      RecordFounderCertificationDecisionInput['decision'],
      'decidedAt' | 'evidenceDigest'
    > & {
      readonly evidenceDigest: string;
    };
    readonly decidedAt?: string;
  }): Promise<MarketingRecordFounderDecisionResult> {
    const entry = this.entryById.get(input.subjectId);
    if (!entry) {
      throw new MarketingCertificationRegistryDriftError(
        `Unknown marketing certification identity: ${input.subjectId}`
      );
    }
    const assuranceProfile = assuranceProfilesBySubject(
      [input.assuranceProfile],
      this.entries
    ).get(input.subjectId);
    if (!assuranceProfile) {
      throw new MarketingCertificationAssuranceError(
        `Assurance profile ${input.assuranceProfile.subjectId} cannot authorize ${input.subjectId}.`
      );
    }
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    assertValidTimestamp(decidedAt, 'Founder decision time');
    if (
      !isPersistedFounderDecision(
        { ...input.decision, decidedAt, subjectId: entry.id },
        entry.id
      )
    ) {
      throw new MarketingCertificationPersistenceError(
        'Founder decision input is invalid.'
      );
    }

    return this.mutate<MarketingRecordFounderDecisionResult>(
      decidedAt,
      ledger => {
        const existing = ledger.records[entry.id];
        assertPacketMatchesEntry(existing.packet, entry);
        if (Date.parse(decidedAt) < Date.parse(existing.packetUpdatedAt)) {
          throw new MarketingCertificationPersistenceError(
            'Founder decision predates the current certification packet.'
          );
        }
        const admission = evaluateCertificationAdmission({
          decisions: existing.decisions,
          evaluatedAt: decidedAt,
          packet: existing.packet,
        });
        const assurance = evaluateMarketingAssurance(
          existing.packet,
          assuranceProfile
        );
        if (assurance.status !== 'qualified') {
          return {
            ledger,
            result: {
              admission,
              assurance,
              blockers: admission.blockers,
              ok: false,
              reason: 'assurance_unqualified',
            },
          };
        }
        const duplicateDecisionId = Object.values(ledger.records).some(record =>
          record.decisions.some(decision => decision.id === input.decision.id)
        );
        if (duplicateDecisionId) {
          return {
            ledger,
            result: {
              admission,
              assurance,
              blockers: [
                {
                  code: 'duplicate_founder_decision',
                  id: input.decision.id,
                  summary:
                    'Founder decision id has already been recorded in the marketing certification ledger.',
                  tier: 'decision',
                },
              ],
              ok: false,
              reason: 'duplicate_founder_decision',
            },
          };
        }
        const recorded = recordFounderCertificationDecision({
          decidedAt,
          decision: input.decision,
          existingDecisions: existing.decisions,
          packet: existing.packet,
        });
        if (!recorded.ok) {
          return { ledger, result: { ...recorded, assurance } };
        }

        const nextRecord: MarketingCertificationRecord = {
          ...existing,
          auditHistory: [
            ...existing.auditHistory,
            ...recorded.admission.auditHistory,
          ],
          decisions: recorded.decisions,
          updatedAt: laterTimestamp(existing.updatedAt, decidedAt),
        };
        return {
          ledger: {
            ...ledger,
            records: { ...ledger.records, [entry.id]: nextRecord },
          },
          result: { ...recorded, assurance },
        };
      }
    );
  }

  async projectLedger(
    evaluatedAt = new Date().toISOString()
  ): Promise<MarketingCertificationLedgerProjection> {
    assertValidTimestamp(evaluatedAt, 'Ledger projection time');
    const ledger = await this.ensureLedger(evaluatedAt);
    assertLedgerMatchesRegistry(ledger, this.entries, evaluatedAt);
    return {
      contract: JOVIE_CERTIFICATION_CONTRACT,
      registryIds: [...ledger.registryIds],
      rows: this.entries.map(entry =>
        projectionRow(entry, ledger.records[entry.id], evaluatedAt)
      ),
    };
  }

  async projectReviewReady(input: {
    readonly existingEntryId: string | null;
    readonly evaluatedAt?: string;
    readonly assuranceProfiles: readonly MarketingAssuranceProfile[];
  }): Promise<MarketingReviewReadyProjection> {
    const profiles = assuranceProfilesBySubject(
      input.assuranceProfiles,
      this.entries
    );
    const projection = await this.projectLedger(input.evaluatedAt);
    const candidates = projection.rows
      .filter(
        row =>
          row.admission.state === 'review_ready' &&
          row.admission.tasteInboxCard !== null
      )
      .map(row => ({
        assurance: evaluateMarketingAssurance(
          row.packet,
          profiles.get(row.identityId)
        ),
        row,
      }));
    const assurance = candidates.map(candidate => candidate.assurance);
    const eligible = candidates
      .filter(candidate => candidate.assurance.status === 'qualified')
      .map(candidate => candidate.row);
    const unqualified = candidates.filter(
      candidate => candidate.assurance.status === 'unqualified'
    );
    const eligibleSubjectIds = eligible.map(row => row.identityId);

    if (input.existingEntryId) {
      return {
        assurance,
        contract: JOVIE_CERTIFICATION_CONTRACT,
        eligibleSubjectIds,
        existingEntryId: input.existingEntryId,
        selected: null,
        withheld: [
          ...unqualified.map(candidate => ({
            reason: 'assurance_unqualified' as const,
            subjectId: candidate.row.identityId,
          })),
          ...eligible.map(row => ({
            reason: 'existing_review_slot_occupied' as const,
            subjectId: row.identityId,
          })),
        ],
      };
    }

    const [selected, ...withheld] = eligible;
    return {
      assurance,
      contract: JOVIE_CERTIFICATION_CONTRACT,
      eligibleSubjectIds,
      existingEntryId: null,
      selected: selected?.admission.tasteInboxCard ?? null,
      withheld: [
        ...unqualified.map(candidate => ({
          reason: 'assurance_unqualified' as const,
          subjectId: candidate.row.identityId,
        })),
        ...withheld.map(row => ({
          reason: 'max_one_arbitration' as const,
          subjectId: row.identityId,
        })),
      ],
    };
  }

  private async ensureLedger(initializedAt: string) {
    for (
      let attempt = 0;
      attempt < MAX_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const raw = await this.backend.get(MARKETING_CERTIFICATION_STORE_KEY);
      if (raw !== null && raw !== undefined) return parseLedger(raw);

      const ledger = initialLedger(this.entries, initializedAt);
      const serialized = serializeLedger(ledger);
      const validated = parseLedger(serialized);
      assertLedgerMatchesRegistry(validated, this.entries, initializedAt);
      const inserted = await this.backend.setIfAbsent(
        MARKETING_CERTIFICATION_STORE_KEY,
        serialized,
        PERSISTENCE_TTL_SECONDS
      );
      if (inserted) return ledger;
    }
    throw new MarketingCertificationPersistenceError(
      'Certification ledger initialization lost compare-and-set repeatedly.'
    );
  }

  private async mutate<Result>(
    initializedAt: string,
    update: (ledger: MarketingCertificationLedger) => {
      readonly ledger: MarketingCertificationLedger;
      readonly result: Result;
    }
  ): Promise<Result> {
    for (
      let attempt = 0;
      attempt < MAX_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const currentRaw = await this.backend.get(
        MARKETING_CERTIFICATION_STORE_KEY
      );
      if (currentRaw === null || currentRaw === undefined) {
        await this.ensureLedger(initializedAt);
        continue;
      }
      if (typeof currentRaw !== 'string') {
        throw new MarketingCertificationPersistenceError(
          'Certification ledger must be stored as one compare-and-set JSON string.'
        );
      }
      const current = parseLedger(currentRaw);
      assertLedgerMatchesRegistry(current, this.entries, initializedAt);
      const next = update(current);
      if (next.ledger === current) return next.result;
      const nextRaw = serializeLedger(next.ledger);
      const validated = parseLedger(nextRaw);
      assertLedgerMatchesRegistry(validated, this.entries, initializedAt);
      const saved = await this.backend.compareAndSet(
        MARKETING_CERTIFICATION_STORE_KEY,
        currentRaw,
        nextRaw,
        PERSISTENCE_TTL_SECONDS
      );
      if (saved) return next.result;
    }
    throw new MarketingCertificationPersistenceError(
      'Certification ledger update lost compare-and-set repeatedly.'
    );
  }
}

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
  | 'invariant_evaluation_missing'
  | 'invariant_evaluation_failed'
  | 'tests_coverage_missing'
  | 'tests_coverage_failed'
  | 'visual_proof_missing'
  | 'visual_proof_failed'
  | 'visual_proof_judge_missing'
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
  | 'runtime_dogfood_failed'
  /** Inbox-only: domain machine evidence (e.g. ACQUISITION_ELIGIBLE) is red/unknown. */
  | 'machine_evidence_failed'
  | 'machine_evidence_unknown';

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

export interface CertificationEvidenceReceipt {
  readonly id: string;
  readonly tier: CertificationEvidenceTier;
  readonly status: CertificationEvidenceStatus;
  readonly sourceSha: string | null;
  readonly ref: string;
  readonly digest: string | null;
  readonly summary: string;
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

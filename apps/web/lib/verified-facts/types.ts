/**
 * JOV-6344 — Verified profile facts: bios and press boilerplate from
 * attributable evidence.
 *
 * Extends the memory entity/evidence model (JOV-2706): a candidate fact binds
 * a canonical `memory_entities` subject to a specific claim and the
 * `memory_source_records` that support it. Approval, verification, and
 * publication permission are separate axes — an approved wording never
 * verifies an unsupported claim, and a model confidence score is never
 * verification.
 */

export type VerifiedFactState =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

export type PublicationPermission = 'unset' | 'granted' | 'private' | 'revoked';

/** Model confidence. Never treated as verification. */
export type FactConfidence = 'low' | 'medium' | 'high';

export type FactClaimKind =
  | 'identity'
  | 'role'
  | 'relationship'
  | 'metric'
  | 'award'
  | 'membership'
  | 'exit';

export interface FactClaim {
  readonly kind: FactClaimKind;
  /** Exact supported claim wording. Generation may paraphrase, never strengthen. */
  readonly text: string;
  /** Exact numeric value where applicable. Display rounding never mutates this. */
  readonly value?: number;
  readonly unit?: string;
  /** Observation window, e.g. '2024-01-01/2024-12-31' or '2024'. */
  readonly window?: string;
  /**
   * 'organization' claims (e.g. a company acquisition value) belong to the
   * org, not the subject — they must not be presented as founder proceeds.
   */
  readonly scope?: 'subject' | 'organization';
  /**
   * For awards/metrics attached to a shared work (a recording, a company):
   * the role the subject must hold for the claim to be attributable. A
   * recording's award is not credited to every contributor.
   */
  readonly attributableRole?: string;
}

export interface FactEvidence {
  /** `memory_source_records` id. */
  readonly sourceRecordId: string;
  /** Where in the source the claim is supported (path, url, section). */
  readonly location: string;
  readonly note?: string;
  /** Private sources stay private unless publicationPermission is 'granted'. */
  readonly privateSource?: boolean;
}

export interface VerifiedFact {
  readonly id: string;
  /** `memory_entities` id of the person/org this fact is about. */
  readonly subjectEntityId: string;
  /** Specific role/relationship the subject holds for this claim. */
  readonly role: string;
  readonly claim: FactClaim;
  readonly evidence: readonly FactEvidence[];
  readonly observedAt: string;
  readonly verifiedAt?: string;
  readonly limitations: readonly string[];
  readonly confidence: FactConfidence;
  readonly status: VerifiedFactState;
  readonly publicationPermission: PublicationPermission;
  /** Human-approved wording. Approval is not verification. */
  readonly approvedText?: string;
  /**
   * Facts sharing a dedupeKey are overlapping reports of the same underlying
   * thing (e.g. two platforms' stream counts for one catalog). They must not
   * be double-counted.
   */
  readonly dedupeKey?: string;
  /** Audiences this fact is relevant to. Empty/absent means all audiences. */
  readonly audiences?: readonly string[];
}

export interface GeneratedSentence {
  readonly text: string;
  readonly factIds: readonly string[];
  readonly sourceRecordIds: readonly string[];
}

export interface OmittedFact {
  readonly factId: string;
  readonly reason:
    | 'not-verified'
    | 'contradicted'
    | 'stale'
    | 'revoked'
    | 'no-publication-permission'
    | 'no-evidence'
    | 'audience-mismatch'
    | 'wrong-subject'
    | 'duplicate-source';
}

export interface GeneratedProfileText {
  readonly subjectEntityId: string;
  readonly text: string;
  readonly sentences: readonly GeneratedSentence[];
  readonly omitted: readonly OmittedFact[];
}

export type ArtifactState = 'current' | 'needs-reapproval' | 'withdrawn';

export interface ArtifactAuditEntry {
  readonly at: string;
  readonly state: ArtifactState;
  readonly reason: string;
  readonly affectedFactIds: readonly string[];
}

export interface GeneratedArtifact {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly text: string;
  readonly sentences: readonly GeneratedSentence[];
  readonly auditTrail: readonly ArtifactAuditEntry[];
}

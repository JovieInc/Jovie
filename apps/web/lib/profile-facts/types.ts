/**
 * Verified profile facts (JOV-6344).
 *
 * Reusable, evidence-bound facts about a canonical subject (memory entity).
 * Generation may select and paraphrase supported facts for an audience; it may
 * not strengthen a claim beyond its evidence, infer publication permission, or
 * treat a model confidence score as verification.
 *
 * Canonical identifiers come from the memory core: `subjectEntityId` is a
 * `memory_entities.id` and every evidence ref points at a
 * `memory_source_records.id`.
 */

/** Lifecycle of a candidate fact. Approval, verification, and permission are separate. */
export type ProfileFactStatus =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

/** Who may see the fact in generated output. Distinct from verification. */
export type FactPublicationPermission = 'private' | 'internal' | 'public';

export type ProfileFactKind =
  | 'identity'
  | 'role'
  | 'relationship'
  | 'affiliation'
  | 'accomplishment'
  | 'metric';

export type FactConfidence = 'low' | 'medium' | 'high';

export interface ProfileFactEvidence {
  /** `memory_source_records.id` backing this fact. */
  readonly sourceRecordId: string;
  /** Where inside the source the claim is supported (url, quote locator, etc.). */
  readonly locator: string;
  /** ISO timestamp when the source was observed. */
  readonly observedAt: string;
}

export interface ProfileFact {
  readonly id: string;
  /** Canonical subject: `memory_entities.id`. */
  readonly subjectEntityId: string;
  readonly kind: ProfileFactKind;
  /** Specific role/relationship when relevant, e.g. "founder", "producer". */
  readonly role?: string;
  /** Exact supported claim text. Generation never strengthens this. */
  readonly claim: string;
  /** Exact numeric value where applicable. Display rounding never mutates it. */
  readonly value?: number;
  readonly unit?: string;
  /** Time window an aggregate applies to, e.g. "2024", "lifetime to 2026-09". */
  readonly window?: string;
  readonly evidence: readonly ProfileFactEvidence[];
  /** ISO timestamp of verification; absent while `status === 'candidate'`. */
  readonly verifiedAt?: string;
  readonly limitations?: string;
  /** Model/extractor confidence only — never a substitute for verification. */
  readonly confidence?: FactConfidence;
  readonly status: ProfileFactStatus;
  readonly permission: FactPublicationPermission;
  /**
   * Human-approved paraphrase used verbatim when the fact is eligible.
   * Approving wording does not verify an unsupported claim.
   */
  readonly approvedWording?: string;
}

/** A subject candidate for disambiguation (wrong-person safety). */
export interface SubjectRef {
  readonly entityId: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  /** Memory entity status; only `confirmed` entities resolve. */
  readonly status: 'candidate' | 'confirmed' | 'rejected' | 'merged';
}

export type SubjectResolution =
  | { readonly outcome: 'resolved'; readonly entityId: string }
  | {
      readonly outcome: 'ambiguous';
      readonly candidateEntityIds: readonly string[];
    }
  | { readonly outcome: 'unknown' };

/** Audiences select which kinds are relevant; relevance never changes facts. */
export type ProfileAudience = 'press' | 'investor' | 'fan' | 'generic';

export interface GeneratedSentence {
  readonly text: string;
  /** Every sentence must trace to at least one supporting fact. */
  readonly factIds: readonly string[];
}

export interface OmittedFact {
  readonly factId: string;
  readonly reason:
    | 'not_verified'
    | 'not_permitted'
    | 'no_evidence'
    | 'wrong_subject'
    | 'not_relevant';
}

export interface GeneratedProfileCopy {
  readonly subjectEntityId: string;
  readonly audience: ProfileAudience;
  readonly sentences: readonly GeneratedSentence[];
  readonly omitted: readonly OmittedFact[];
}

export type DerivativeStatus = 'active' | 'needs_reapproval' | 'withdrawn';

export interface DerivativeVersion {
  readonly version: number;
  readonly generatedAt: string;
  readonly copy: GeneratedProfileCopy;
}

/**
 * A stored derivative (bio, boilerplate, pitch). Historical approved versions
 * are retained for audit; status changes never delete them.
 */
export interface DerivativeRecord {
  readonly id: string;
  readonly kind: 'bio' | 'boilerplate' | 'pitch';
  readonly subjectEntityId: string;
  readonly status: DerivativeStatus;
  readonly factIds: readonly string[];
  readonly versions: readonly DerivativeVersion[];
}

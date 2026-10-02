/**
 * Verified profile facts — domain model (JOV-6344).
 * Approval, verification, and permission are independent gates: approved
 * wording never verifies a claim, and model confidence is not verification.
 */

export type FactStatus =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

export type PublicationScope = 'private' | 'internal' | 'public';

export type ClaimKind =
  | 'role'
  | 'membership'
  | 'identifier'
  | 'metric'
  | 'award'
  | 'relationship';

export interface ClaimWindow {
  readonly start?: string;
  readonly end?: string;
}

export interface FactClaim {
  readonly kind: ClaimKind;
  /** Stable predicate, e.g. 'founder-of', 'spotify-artist-id', 'streams'. */
  readonly predicate: string;
  /** Exact value — never rounded; rounding lives only in displayValue. */
  readonly value: string | number;
  readonly unit?: string;
  /** Bound qualifier, e.g. org name or 'nominated' vs 'won'. */
  readonly qualifier?: string;
  readonly window?: ClaimWindow;
  readonly displayValue?: string;
}

export interface FactSource {
  /** URL, repo path, or document reference. */
  readonly location: string;
  readonly refs: readonly string[];
  readonly observedAt: string;
  readonly verifiedAt?: string;
  /** Private-source facts stay private unless explicitly permitted. */
  readonly privateSource?: boolean;
}

export interface FactApproval {
  readonly approved: boolean;
  readonly approvedWording?: string;
  readonly decidedBy?: string;
  readonly decidedAt?: string;
}

export interface FactPermission {
  readonly scope: PublicationScope;
  readonly grantedAt?: string;
  readonly revokedAt?: string;
}

export interface ProfileFact {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly claim: FactClaim;
  readonly sources: readonly FactSource[];
  readonly limitations: readonly string[];
  /** Model confidence. Not verification. */
  readonly confidence: number;
  readonly status: FactStatus;
  readonly approval: FactApproval;
  readonly permission: FactPermission;
}

/** Facts bind `subjectEntityId`, never a name. */
export interface SubjectEntity {
  readonly entityId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly identifiers: Readonly<Record<string, string>>;
}

export type SubjectResolution =
  | { readonly status: 'resolved'; readonly entity: SubjectEntity }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly SubjectEntity[];
    }
  | { readonly status: 'unknown' };

export interface GeneratedSentence {
  readonly text: string;
  /** Sentence-to-evidence traceability. */
  readonly factIds: readonly string[];
}

export type CopySurface = 'bio' | 'pitch' | 'boilerplate';

export interface OmittedClaim {
  readonly factId: string;
  readonly reason:
    | 'unverified'
    | 'contradicted'
    | 'stale'
    | 'revoked'
    | 'not-approved'
    | 'not-permitted';
}

export interface GeneratedCopy {
  readonly surface: CopySurface;
  readonly subjectEntityId: string;
  readonly sentences: readonly GeneratedSentence[];
  readonly text: string;
  readonly omitted: readonly OmittedClaim[];
}

export interface AuditEvent {
  readonly at: string;
  readonly event:
    | 'generated'
    | 'fact-revoked'
    | 'fact-contradicted'
    | 'fact-stale'
    | 'marked-for-reapproval'
    | 'withdrawn';
  readonly detail: string;
}

/** A generated derivative bound to the facts it consumed. */
export interface DerivativeRecord {
  readonly id: string;
  readonly copy: GeneratedCopy;
  status: 'active' | 'needs-reapproval' | 'withdrawn';
  readonly history: AuditEvent[];
}

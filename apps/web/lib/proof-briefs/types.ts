/**
 * Proof Briefs — domain model (JOV-7216).
 *
 * A Proof Brief is an immutable, certified snapshot compiled from already
 * selected proof events. It is a bounded editorial compiler over approved
 * evidence, not a generic summarizer: it may emphasize, select, and
 * paraphrase within the evidence, but it may never strengthen a claim,
 * invent causality, or let one subject's private data leak into another
 * audience's variant.
 */

export type BriefAudience =
  | 'investor'
  | 'customer'
  | 'manager'
  | 'founder'
  | 'internal';

/** Maximum audience tier the evidence may be disclosed to. */
export type DisclosureScope = 'private' | 'internal' | 'public';

export type ProofEventStatus =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

/**
 * Attribution strength the evidence supports. `direct` = we can reasonably
 * attribute the change to our work; `correlated` = it changed in the window
 * but causality is not established; `none` = we did something, outcome
 * unknown.
 */
export type Attribution = 'direct' | 'correlated' | 'none';

export interface ProofMetric {
  /** Stable predicate, e.g. 'p50-page-load-ms', 'weekly-active-profiles'. */
  readonly predicate: string;
  readonly label: string;
  readonly before?: number;
  readonly after?: number;
  readonly value?: number;
  readonly unit?: string;
  /** Required when the metric is a rate/percent or per-segment value. */
  readonly denominator?: string;
  /** Observation window the metric covers, e.g. '7d'. */
  readonly window?: string;
}

export interface ProofEvent {
  /** Stable evidence id; paired with `revision` it pins exact evidence. */
  readonly id: string;
  readonly revision: string;
  /** Canonical subject entity id — never a bare name. */
  readonly subjectEntityId: string;
  readonly subjectName: string;
  readonly status: ProofEventStatus;
  /**
   * What we did (an action or shipped capability). Plain nouns; wording
   * polish lives on the brief, not here.
   */
  readonly did: string;
  /** What changed because of it, when measurable. */
  readonly changed?: string;
  readonly attribution: Attribution;
  readonly metric?: ProofMetric;
  /** When the underlying evidence was last observed/verified (ISO date). */
  readonly observedAt: string;
  /** Ceiling on who may see this evidence. */
  readonly disclosure: DisclosureScope;
  /**
   * Meaningfulness per audience, 0–1. Used for hero/support selection; a
   * missing entry means 0 for that audience.
   */
  readonly audienceRelevance: Readonly<Partial<Record<BriefAudience, number>>>;
  /** Caveats a reader needs to interpret this correctly. */
  readonly limitations: readonly string[];
  /** Editorially approved wording, when it exists; used verbatim. */
  readonly approvedWording?: string;
}

export interface BriefRequest {
  readonly audience: BriefAudience;
  readonly subjectEntityId: string;
  /** Requested window length in days; evidence older than this is stale. */
  readonly windowDays: number;
  /** 'As of' date for the snapshot (ISO date). */
  readonly asOf: string;
  /** Maximum disclosure this brief may carry. */
  readonly disclosureScope: DisclosureScope;
}

export interface BriefHighlight {
  readonly eventId: string;
  readonly revision: string;
  /** Generated or editorially approved wording for this audience. */
  readonly wording: string;
  readonly wordingSource: 'approved' | 'generated';
  /** Preserved distinctions: what we did vs. what changed vs. attribution. */
  readonly did: string;
  readonly changed?: string;
  readonly attribution: Attribution;
}

export interface ProofBrief {
  /** Deterministic snapshot id derived from the content hash. */
  readonly id: string;
  readonly audience: BriefAudience;
  readonly subjectEntityId: string;
  readonly subjectName: string;
  readonly windowDays: number;
  readonly asOf: string;
  readonly disclosureScope: DisclosureScope;
  readonly hero: BriefHighlight;
  /** 0–3 supporting items; fewer is correct when quality is weak. */
  readonly supporting: readonly BriefHighlight[];
  /** Exact selected evidence, id + revision. */
  readonly evidence: readonly { id: string; revision: string }[];
  /** Caveats required for correct interpretation of this brief. */
  readonly limitations: readonly string[];
  /** Oldest evidence observation in the brief (ISO date). */
  readonly freshestAsOf: string;
  readonly certification: Certification;
  /** sha256 over canonical content; material change invalidates the snapshot. */
  readonly contentHash: string;
}

export type CertificationCheckId =
  | 'truth-current'
  | 'meaningful'
  | 'understandable'
  | 'no-overclaim'
  | 'denominators'
  | 'no-filler'
  | 'no-material-omission'
  | 'disclosure-bound';

export interface CertificationFinding {
  readonly check: CertificationCheckId;
  readonly severity: 'fail' | 'warn';
  readonly detail: string;
}

export interface Certification {
  readonly result: 'certified' | 'rejected';
  readonly evaluatorVersion: string;
  readonly findings: readonly CertificationFinding[];
  readonly certifiedAt: string;
}

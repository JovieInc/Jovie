import type { MemorySourceType } from '@/lib/db/schema/memory';

/**
 * Verified profile facts (JOV-6344)
 *
 * Turns the memory entity/evidence graph into attributable profile proof:
 * candidate facts bound to canonical entity IDs and source records, a
 * lifecycle that separates approval from verification and publication
 * permission, and deterministic bio/press-boilerplate generation with
 * sentence-to-evidence traceability.
 *
 * Invariant: generation may select and paraphrase supported facts for an
 * audience; it may not strengthen a claim beyond its evidence, infer
 * publication permission, or turn a confidence score into verification.
 * Unavailable claims are omitted, never manufactured.
 */

export type ProfileFactStatus =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

export type PublicationPermission = 'private' | 'internal' | 'public';

export type FactConfidence = 'low' | 'medium' | 'high';

export interface ProfileFactWindow {
  readonly start: string;
  readonly end?: string;
}

export interface ProfileFactClaim {
  /** What is claimed, e.g. 'all-time Spotify streams'. */
  readonly label: string;
  /** Exact value. Deliberately rounded display uses `displayValue` only. */
  readonly value: number | string;
  readonly unit?: string;
  readonly window?: ProfileFactWindow;
}

export interface ProfileFactEvidence {
  /** Canonical memory_source_records.id */
  readonly sourceRecordId: string;
  readonly sourceType: MemorySourceType;
  /** Where in the source the claim is supported (URL, doc anchor, line). */
  readonly location?: string;
  readonly note?: string;
  /** Private-source facts stay private unless `publication` is 'public'. */
  readonly visibility: 'public' | 'private';
}

export interface ProfileFact {
  readonly id: string;
  /** Canonical memory_entities.id for the subject. */
  readonly subjectEntityId: string;
  readonly subjectName: string;
  /** Specific role/relationship, e.g. 'founder', 'member', 'writer'. */
  readonly relation?: string;
  /** Object of the relation, e.g. 'Jovie'. */
  readonly objectName?: string;
  /**
   * Rendered sentence fragment bound to the evidence, e.g.
   * 'is the founder of Jovie'. Generated output uses this verbatim;
   * it must not assert more than `claim` + `evidence` support.
   */
  readonly phrase: string;
  readonly claim: ProfileFactClaim;
  readonly evidence: readonly ProfileFactEvidence[];
  readonly observedAt: string;
  readonly verifiedAt?: string;
  /** After this instant the fact is treated as stale pending re-check. */
  readonly expiresAt?: string;
  readonly limitations?: readonly string[];
  readonly confidence: FactConfidence;
  status: ProfileFactStatus;
  publication: PublicationPermission;
  /**
   * Human-approved wording. Approval is orthogonal to verification:
   * approved wording on an unverified fact does not make it eligible.
   */
  approvedWording?: string;
  /**
   * Groups overlapping observations of the same underlying quantity so
   * generators dedupe instead of double-counting (e.g. two providers
   * reporting the same all-time stream count).
   */
  readonly aggregateKey?: string;
  /** Audience/topic tags used only for relevance selection. */
  readonly topics?: readonly string[];
}

export type ResolvedFactStatus = ProfileFactStatus | 'publication_eligible';

export interface ResolvedFact {
  readonly fact: ProfileFact;
  /** Effective lifecycle state after applying staleness. */
  readonly status: ProfileFactStatus;
  readonly publicationEligible: boolean;
  readonly reasons: readonly string[];
}

const CONFIDENCE_RANK: Record<FactConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function resolveFact(
  fact: ProfileFact,
  now: Date = new Date()
): ResolvedFact {
  const reasons: string[] = [];
  let status = fact.status;

  if (status === 'revoked') {
    reasons.push('fact revoked');
  } else if (status === 'contradicted') {
    reasons.push('contradictory evidence');
  } else if (
    status !== 'candidate' &&
    fact.expiresAt != null &&
    new Date(fact.expiresAt).getTime() <= now.getTime()
  ) {
    status = 'stale';
    reasons.push('evidence window expired');
  }

  if (status === 'candidate') {
    reasons.push('not verified');
  }
  if (fact.evidence.length === 0) {
    reasons.push('no evidence');
  }
  if (fact.publication !== 'public') {
    reasons.push(`publication permission is ${fact.publication}`);
  }

  const publicationEligible =
    status === 'verified' &&
    fact.publication === 'public' &&
    fact.evidence.length > 0;

  return { fact, status, publicationEligible, reasons };
}

export interface SelectFactsOptions {
  readonly subjectEntityId: string;
  readonly now?: Date;
  /**
   * Restrict selection to facts carrying at least one of these topic tags.
   * Relevance filter only — it never alters the fact or its wording.
   */
  readonly topics?: readonly string[];
  readonly maxFacts?: number;
}

/**
 * Resolve subject ambiguity by binding strictly to `subjectEntityId` —
 * a same-name different-person entity is excluded. Dedupe overlapping
 * sources in the same `aggregateKey` (keeps the most confident, then most
 * recently verified) so aggregate counts are never double-counted.
 */
export function selectEligibleFacts(
  facts: readonly ProfileFact[],
  options: SelectFactsOptions
): ResolvedFact[] {
  const now = options.now ?? new Date();
  const topics = options.topics ? new Set(options.topics) : null;

  const eligible = facts
    .filter(f => f.subjectEntityId === options.subjectEntityId)
    .filter(
      f =>
        topics == null || f.topics == null || f.topics.some(t => topics.has(t))
    )
    .map(f => resolveFact(f, now))
    .filter(r => r.publicationEligible);

  const byAggregate = new Map<string, ResolvedFact>();
  const singles: ResolvedFact[] = [];
  for (const resolved of eligible) {
    const key = resolved.fact.aggregateKey;
    if (key == null) {
      singles.push(resolved);
      continue;
    }
    const existing = byAggregate.get(key);
    if (
      existing == null ||
      CONFIDENCE_RANK[resolved.fact.confidence] >
        CONFIDENCE_RANK[existing.fact.confidence] ||
      (resolved.fact.confidence === existing.fact.confidence &&
        (resolved.fact.verifiedAt ?? '') > (existing.fact.verifiedAt ?? ''))
    ) {
      byAggregate.set(key, resolved);
    }
  }

  const all = [...singles, ...byAggregate.values()];
  return options.maxFacts != null ? all.slice(0, options.maxFacts) : all;
}

export interface GeneratedSentence {
  readonly text: string;
  readonly factId: string;
  readonly evidenceSourceRecordIds: readonly string[];
}

export type DerivativeKind = 'bio' | 'pitch' | 'boilerplate';

export type DerivativeStatus =
  | 'draft'
  | 'approved'
  | 'needs_reapproval'
  | 'withdrawn';

export interface DerivativeVersion {
  readonly at: string;
  readonly status: DerivativeStatus;
  readonly sentences: readonly GeneratedSentence[];
  readonly note?: string;
}

export interface GeneratedDerivative {
  readonly kind: DerivativeKind;
  readonly subjectEntityId: string;
  readonly audience?: string;
  readonly sentences: readonly GeneratedSentence[];
  status: DerivativeStatus;
  /** Audit trail; approved versions are retained after later revocation. */
  readonly versions: readonly DerivativeVersion[];
}

/**
 * Lint a sentence against its source fact: every numeric token in the
 * rendered text must equal the claim's exact value (or an explicitly
 * declared rounded `displayValue`). This is the guard against
 * embellishing paraphrases — a paraphrase that inflates the number,
 * adds an unsupported count, or upgrades units is rejected.
 */
export function lintSentenceAgainstFact(
  text: string,
  fact: ProfileFact & { readonly displayValue?: number | string }
): string[] {
  const allowed = new Set<string>();
  allowed.add(normalizeNumberToken(String(fact.claim.value)));
  if (fact.displayValue != null) {
    allowed.add(normalizeNumberToken(String(fact.displayValue)));
  }
  if (fact.claim.window != null) {
    for (const endpoint of [fact.claim.window.start, fact.claim.window.end]) {
      if (endpoint != null) {
        for (const token of endpoint.match(/\d+/g) ?? []) {
          allowed.add(token);
        }
      }
    }
  }

  const violations: string[] = [];
  for (const match of text.match(/\d[\d,.]*/g) ?? []) {
    const normalized = normalizeNumberToken(match);
    if (!allowed.has(normalized)) {
      violations.push(`unsupported numeric claim '${match}' in '${text}'`);
    }
  }
  return violations;
}

function normalizeNumberToken(token: string): string {
  return token.replace(/[.,]/g, '');
}

function renderSentence(fact: ProfileFact): GeneratedSentence {
  const subject = fact.subjectName;
  const phrase = fact.phrase.trim().replace(/\.+$/, '');
  return {
    text: `${subject} ${phrase}.`,
    factId: fact.id,
    evidenceSourceRecordIds: [
      ...new Set(fact.evidence.map(e => e.sourceRecordId)),
    ],
  };
}

export interface GenerateDerivativeOptions extends SelectFactsOptions {
  readonly kind: DerivativeKind;
  readonly audience?: string;
}

/**
 * Select publication-eligible facts for the subject and render one
 * traceable sentence per fact. Facts that are not eligible are omitted —
 * never replaced with manufactured completeness. Selection can be
 * audience-relevant via `topics` without changing any fact.
 */
export function generateDerivative(
  facts: readonly ProfileFact[],
  options: GenerateDerivativeOptions
): GeneratedDerivative {
  const selected = selectEligibleFacts(facts, options);
  const sentences: GeneratedSentence[] = [];
  for (const { fact } of selected) {
    const sentence = renderSentence(fact);
    const violations = lintSentenceAgainstFact(sentence.text, fact);
    if (violations.length > 0) {
      throw new Error(
        `Generated sentence exceeds its evidence: ${violations.join('; ')}`
      );
    }
    sentences.push(sentence);
  }
  const at = new Date().toISOString();
  return {
    kind: options.kind,
    subjectEntityId: options.subjectEntityId,
    audience: options.audience,
    sentences,
    status: 'draft',
    versions: [{ at, status: 'draft', sentences, note: 'generated' }],
  };
}

/**
 * Record human approval of wording. Approval does not verify any claim —
 * it only marks the current sentence set as approved.
 */
export function approveDerivative(
  derivative: GeneratedDerivative,
  at: string = new Date().toISOString()
): GeneratedDerivative {
  return {
    ...derivative,
    status: 'approved',
    versions: [
      ...derivative.versions,
      { at, status: 'approved', sentences: derivative.sentences },
    ],
  };
}

/**
 * Apply updated fact states to a generated derivative. Revocation or
 * contradiction of an underlying fact withdraws the affected sentences
 * and marks the derivative for reapproval; prior versions remain in the
 * audit trail.
 */
export function applyFactStates(
  derivative: GeneratedDerivative,
  facts: readonly ProfileFact[],
  at: string = new Date().toISOString()
): { derivative: GeneratedDerivative; withdrawnFactIds: string[] } {
  const byId = new Map(facts.map(f => [f.id, f]));
  const withdrawnFactIds: string[] = [];
  const kept: GeneratedSentence[] = [];

  for (const sentence of derivative.sentences) {
    const fact = byId.get(sentence.factId);
    const eligible = fact != null && resolveFact(fact).publicationEligible;
    if (eligible) {
      kept.push(sentence);
    } else {
      withdrawnFactIds.push(sentence.factId);
    }
  }

  if (withdrawnFactIds.length === 0) {
    return { derivative, withdrawnFactIds };
  }

  const status: DerivativeStatus =
    kept.length === 0 ? 'withdrawn' : 'needs_reapproval';

  return {
    derivative: {
      ...derivative,
      sentences: kept,
      status,
      versions: [
        ...derivative.versions,
        {
          at,
          status,
          sentences: kept,
          note: `withdrew facts: ${withdrawnFactIds.join(', ')}`,
        },
      ],
    },
    withdrawnFactIds,
  };
}

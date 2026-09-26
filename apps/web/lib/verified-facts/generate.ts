import { eligibleFacts, isAttributable } from './eligibility';
import type {
  ArtifactAuditEntry,
  ArtifactState,
  GeneratedArtifact,
  GeneratedProfileText,
  GeneratedSentence,
  OmittedFact,
  VerifiedFact,
} from './types';

export interface GenerateOptions {
  readonly audience?: string;
  /** Deliberate display rounding; the underlying fact value stays exact. */
  readonly displayRounding?: (value: number, unit?: string) => string;
}

function sourceRecordIds(fact: VerifiedFact): string[] {
  return [...new Set(fact.evidence.map(e => e.sourceRecordId))];
}

/**
 * The sentence for a fact is its human-approved wording when present, else
 * the exact claim text. Generation selects and places supported claims; it
 * never invents a stronger one.
 */
export function sentenceForFact(
  fact: VerifiedFact,
  options: GenerateOptions = {}
): GeneratedSentence {
  let text = fact.approvedText ?? fact.claim.text;
  if (
    options.displayRounding &&
    fact.claim.value !== undefined &&
    fact.approvedText === undefined
  ) {
    text = `${text} (${options.displayRounding(fact.claim.value, fact.claim.unit)})`;
  }
  return { text, factIds: [fact.id], sourceRecordIds: sourceRecordIds(fact) };
}

/**
 * Build a short bio / press boilerplate from publication-eligible facts.
 * Each sentence carries its fact ids and source record ids so every claim
 * is traceable. Unsupported facts are omitted with a reason rather than
 * patched over.
 */
export function generateProfileText(
  facts: readonly VerifiedFact[],
  subjectEntityId: string,
  options: GenerateOptions = {}
): GeneratedProfileText {
  const { eligible, omitted } = eligibleFacts(
    facts,
    subjectEntityId,
    options.audience
  );

  const sentences: GeneratedSentence[] = [];
  const allOmitted: OmittedFact[] = [...omitted];

  for (const fact of eligible) {
    if (!isAttributable(fact)) {
      allOmitted.push({ factId: fact.id, reason: 'wrong-subject' });
      continue;
    }
    sentences.push(sentenceForFact(fact, options));
  }

  return {
    subjectEntityId,
    text: sentences.map(s => s.text).join(' '),
    sentences,
    omitted: allOmitted,
  };
}

/**
 * Every number appearing in a generated sentence must come from a backing
 * fact's exact value (or its deliberately rounded display). Rejects
 * embellishing paraphrases.
 */
export function validateSentence(
  sentence: GeneratedSentence,
  facts: readonly VerifiedFact[],
  options: GenerateOptions = {}
): readonly string[] {
  const problems: string[] = [];
  const backing = facts.filter(f => sentence.factIds.includes(f.id));
  const allowed = new Set<string>();
  for (const fact of backing) {
    if (fact.claim.value === undefined) continue;
    allowed.add(String(fact.claim.value));
    if (options.displayRounding) {
      allowed.add(options.displayRounding(fact.claim.value, fact.claim.unit));
    }
  }
  const numbersInText = sentence.text.match(/\d[\d,.]*[a-zA-Z]?/g) ?? [];
  for (const raw of numbersInText) {
    const normalized = raw.replace(/,/g, '');
    if (!allowed.has(normalized) && !allowed.has(raw)) {
      problems.push(
        `unsupported number "${raw}" in sentence: ${sentence.text}`
      );
    }
  }
  if (backing.length === 0) {
    problems.push(`sentence has no backing facts: ${sentence.text}`);
  }
  return problems;
}

/**
 * Reassess a previously generated artifact against current fact states.
 * Revoked or contradicted backing facts withdraw the artifact; stale facts
 * or revoked permission mark it for reapproval. Historical state is kept —
 * an audit entry is appended, never rewritten.
 */
export function assessArtifact(
  artifact: GeneratedArtifact,
  facts: readonly VerifiedFact[],
  at: string
): { artifact: GeneratedArtifact; state: ArtifactState } {
  const backing = facts.filter(fact =>
    artifact.sentences.some(s => s.factIds.includes(fact.id))
  );

  const withdrawnIds = backing
    .filter(f => f.status === 'revoked' || f.status === 'contradicted')
    .map(f => f.id);
  const reapprovalIds = backing
    .filter(
      f =>
        f.status === 'stale' ||
        f.status === 'candidate' ||
        f.publicationPermission !== 'granted'
    )
    .map(f => f.id);

  const state: ArtifactState =
    withdrawnIds.length > 0
      ? 'withdrawn'
      : reapprovalIds.length > 0
        ? 'needs-reapproval'
        : 'current';

  const affected = withdrawnIds.length > 0 ? withdrawnIds : reapprovalIds;
  const reason =
    state === 'withdrawn'
      ? 'backing fact revoked or contradicted'
      : state === 'needs-reapproval'
        ? 'backing fact stale or publication permission changed'
        : 'all backing facts remain verified and permitted';

  if (state === 'current' && artifact.auditTrail.length > 0) {
    const last = artifact.auditTrail[artifact.auditTrail.length - 1];
    if (last.state === 'current') return { artifact, state };
  }

  const entry: ArtifactAuditEntry = {
    at,
    state,
    reason,
    affectedFactIds: affected,
  };
  return {
    artifact: { ...artifact, auditTrail: [...artifact.auditTrail, entry] },
    state,
  };
}

import type { FactConfidence, OmittedFact, VerifiedFact } from './types';

const CONFIDENCE_RANK: Record<FactConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * A fact is usable for generated text only when it is verified AND has an
 * explicit publication grant. 'private' is a standing permission, not an
 * omission of one — private-source facts stay private unless granted.
 */
export function isPublicationEligible(fact: VerifiedFact): boolean {
  return (
    fact.status === 'verified' &&
    fact.publicationPermission === 'granted' &&
    fact.evidence.length > 0
  );
}

export function omissionReason(
  fact: VerifiedFact
): OmittedFact['reason'] | null {
  if (fact.evidence.length === 0) return 'no-evidence';
  switch (fact.status) {
    case 'contradicted':
      return 'contradicted';
    case 'stale':
      return 'stale';
    case 'revoked':
      return 'revoked';
    case 'candidate':
      return 'not-verified';
    case 'verified':
      return fact.publicationPermission === 'granted'
        ? null
        : 'no-publication-permission';
  }
}

export function factsForSubject(
  facts: readonly VerifiedFact[],
  subjectEntityId: string
): readonly VerifiedFact[] {
  return facts.filter(fact => fact.subjectEntityId === subjectEntityId);
}

/**
 * Eligible facts for one subject and audience, with overlapping sources
 * (same dedupeKey) collapsed to a single strongest report so aggregates
 * never double-count.
 */
export function eligibleFacts(
  facts: readonly VerifiedFact[],
  subjectEntityId: string,
  audience?: string
): {
  readonly eligible: readonly VerifiedFact[];
  readonly omitted: readonly OmittedFact[];
} {
  const eligible: VerifiedFact[] = [];
  const omitted: OmittedFact[] = [];
  const byDedupeKey = new Map<string, VerifiedFact>();

  for (const fact of factsForSubject(facts, subjectEntityId)) {
    const reason = omissionReason(fact);
    if (reason) {
      omitted.push({ factId: fact.id, reason });
      continue;
    }
    if (
      audience &&
      fact.audiences &&
      fact.audiences.length > 0 &&
      !fact.audiences.includes(audience)
    ) {
      omitted.push({ factId: fact.id, reason: 'audience-mismatch' });
      continue;
    }
    if (fact.dedupeKey) {
      const existing = byDedupeKey.get(fact.dedupeKey);
      if (existing) {
        const preferred = preferFact(existing, fact);
        byDedupeKey.set(fact.dedupeKey, preferred);
        const dropped = preferred === fact ? existing : fact;
        omitted.push({ factId: dropped.id, reason: 'duplicate-source' });
        const idx = eligible.indexOf(existing);
        if (idx >= 0 && preferred === fact) eligible[idx] = fact;
        else if (idx < 0) eligible.push(preferred);
        continue;
      }
      byDedupeKey.set(fact.dedupeKey, fact);
    }
    eligible.push(fact);
  }

  return { eligible, omitted };
}

function preferFact(a: VerifiedFact, b: VerifiedFact): VerifiedFact {
  const confidenceDelta =
    CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  if (confidenceDelta !== 0) return confidenceDelta > 0 ? b : a;
  return b.observedAt > a.observedAt ? b : a;
}

/**
 * Sum a metric across eligible facts without double-counting overlapping
 * sources. Organization-scoped claims are excluded from subject totals.
 */
export function aggregateMetric(
  facts: readonly VerifiedFact[],
  subjectEntityId: string,
  unit: string
): { value: number; unit: string; factIds: readonly string[] } | null {
  const { eligible } = eligibleFacts(facts, subjectEntityId);
  const matching = eligible.filter(
    fact =>
      fact.claim.kind === 'metric' &&
      fact.claim.unit === unit &&
      fact.claim.value !== undefined &&
      (fact.claim.scope ?? 'subject') === 'subject'
  );
  if (matching.length === 0) return null;
  return {
    value: matching.reduce((sum, fact) => sum + (fact.claim.value ?? 0), 0),
    unit,
    factIds: matching.map(fact => fact.id),
  };
}

/**
 * Whether an award claim on a shared work is attributable to the subject:
 * the fact's role must match the role the claim requires.
 */
export function isAttributable(fact: VerifiedFact): boolean {
  const required = fact.claim.attributableRole;
  return required === undefined || fact.role === required;
}

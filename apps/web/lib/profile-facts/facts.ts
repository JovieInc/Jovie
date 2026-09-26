import type {
  FactPublicationPermission,
  OmittedFact,
  ProfileFact,
  ProfileFactStatus,
  SubjectRef,
  SubjectResolution,
} from './types';

const BLOCKING_STATUSES: ReadonlySet<ProfileFactStatus> = new Set([
  'candidate',
  'contradicted',
  'stale',
  'revoked',
]);

const PUBLISHABLE_PERMISSIONS: ReadonlySet<FactPublicationPermission> = new Set(
  ['public']
);

export type FactEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: OmittedFact['reason'] };

/**
 * A fact is publishable only when verified, public-permissioned, and backed by
 * evidence. Confidence scores and approved wording never substitute.
 */
export function factEligibility(fact: ProfileFact): FactEligibility {
  if (BLOCKING_STATUSES.has(fact.status)) {
    return { eligible: false, reason: 'not_verified' };
  }
  if (!PUBLISHABLE_PERMISSIONS.has(fact.permission)) {
    return { eligible: false, reason: 'not_permitted' };
  }
  if (fact.evidence.length === 0) {
    return { eligible: false, reason: 'no_evidence' };
  }
  return { eligible: true };
}

export function isPublishable(fact: ProfileFact): boolean {
  return factEligibility(fact).eligible;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolve a display name to a canonical entity. Only `confirmed` entities are
 * eligible; multiple matches are ambiguous rather than guessed — generation
 * must never attribute facts across a wrong-person boundary.
 */
export function resolveSubject(
  subjects: readonly SubjectRef[],
  name: string
): SubjectResolution {
  const needle = normalizeName(name);
  const matches = subjects.filter(subject => {
    if (subject.status !== 'confirmed') {
      return false;
    }
    const names = [subject.name, ...(subject.aliases ?? [])];
    return names.some(candidate => normalizeName(candidate) === needle);
  });

  if (matches.length === 0) {
    return { outcome: 'unknown' };
  }
  if (matches.length > 1) {
    return {
      outcome: 'ambiguous',
      candidateEntityIds: matches.map(match => match.entityId),
    };
  }
  const [only] = matches;
  return { outcome: 'resolved', entityId: only.entityId };
}

/** Facts that may be published about a specific subject. */
export function eligibleFactsForSubject(
  subjectEntityId: string,
  facts: readonly ProfileFact[]
): { eligible: ProfileFact[]; omitted: OmittedFact[] } {
  const eligible: ProfileFact[] = [];
  const omitted: OmittedFact[] = [];

  for (const fact of facts) {
    if (fact.subjectEntityId !== subjectEntityId) {
      omitted.push({ factId: fact.id, reason: 'wrong_subject' });
      continue;
    }
    const eligibility = factEligibility(fact);
    if (eligibility.eligible) {
      eligible.push(fact);
    } else {
      omitted.push({ factId: fact.id, reason: eligibility.reason });
    }
  }

  return { eligible, omitted };
}

/**
 * Recompute derivative status after a fact transition. Revoked or contradicted
 * facts withdraw their derivatives; stale facts or narrowed permission mark
 * them for reapproval. Versions are never deleted — the audit trail stands.
 */
export function derivativeStatusForFacts(
  factIds: readonly string[],
  factsById: ReadonlyMap<string, ProfileFact>
): 'active' | 'needs_reapproval' | 'withdrawn' {
  let status: 'active' | 'needs_reapproval' | 'withdrawn' = 'active';

  for (const factId of factIds) {
    const fact = factsById.get(factId);
    if (!fact) {
      status = 'needs_reapproval';
      continue;
    }
    if (fact.status === 'revoked' || fact.status === 'contradicted') {
      return 'withdrawn';
    }
    if (!isPublishable(fact)) {
      status = 'needs_reapproval';
    }
  }

  return status;
}

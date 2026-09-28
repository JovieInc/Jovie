import type {
  AuditEvent,
  DerivativeRecord,
  FactPermission,
  FactStatus,
  ProfileFact,
  PublicationScope,
  SubjectEntity,
  SubjectResolution,
} from './types';

// A bare name matching >1 entity is ambiguous — disambiguate via identifier.
export function resolveSubject(
  subjects: readonly SubjectEntity[],
  query: string
): SubjectResolution {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return { status: 'unknown' };

  const byId = subjects.filter(
    entity =>
      entity.entityId === query ||
      Object.values(entity.identifiers).some(
        identifier => identifier.toLowerCase() === normalized
      )
  );
  if (byId.length === 1) return { status: 'resolved', entity: byId[0] };
  if (byId.length > 1) return { status: 'ambiguous', candidates: byId };

  const byName = subjects.filter(
    entity =>
      entity.name.toLowerCase() === normalized ||
      entity.aliases.some(alias => alias.toLowerCase() === normalized)
  );
  if (byName.length === 1) return { status: 'resolved', entity: byName[0] };
  if (byName.length > 1) return { status: 'ambiguous', candidates: byName };
  return { status: 'unknown' };
}

// Eligibility = verified status + approval + live 'public' permission.
// Private-source facts need an explicit permission grant.
export function isPublicationEligible(fact: ProfileFact): boolean {
  if (fact.status !== 'verified') return false;
  if (!fact.approval.approved) return false;
  if (fact.permission.scope !== 'public') return false;
  if (fact.permission.revokedAt) return false;
  if (
    fact.sources.some(source => source.privateSource) &&
    !fact.permission.grantedAt
  ) {
    return false;
  }
  return true;
}

function transition(
  fact: ProfileFact,
  status: FactStatus,
  permission?: Partial<FactPermission>
): ProfileFact {
  return {
    ...fact,
    status,
    permission: { ...fact.permission, ...permission },
  };
}

export function verifyFact(fact: ProfileFact): ProfileFact {
  return transition(fact, 'verified');
}

export function contradictFact(fact: ProfileFact): ProfileFact {
  return transition(fact, 'contradicted');
}

export function markFactStale(fact: ProfileFact): ProfileFact {
  return transition(fact, 'stale');
}

export function revokeFact(fact: ProfileFact, revokedAt: string): ProfileFact {
  return transition(fact, 'revoked', { revokedAt });
}

export function approveFact(
  fact: ProfileFact,
  approvedWording: string,
  decidedBy: string,
  decidedAt: string
): ProfileFact {
  return {
    ...fact,
    approval: { approved: true, approvedWording, decidedBy, decidedAt },
  };
}

export function setPublicationPermission(
  fact: ProfileFact,
  scope: PublicationScope,
  grantedAt: string
): ProfileFact {
  return {
    ...fact,
    permission: { ...fact.permission, scope, grantedAt, revokedAt: undefined },
  };
}

export function findContradictions(
  facts: readonly ProfileFact[]
): ProfileFact[][] {
  const groups = new Map<string, ProfileFact[]>();
  for (const fact of facts) {
    if (fact.claim.kind === 'identifier' || fact.claim.kind === 'metric') {
      const key = `${fact.subjectEntityId}:${fact.claim.kind}:${fact.claim.predicate}`;
      const list = groups.get(key) ?? [];
      list.push(fact);
      groups.set(key, list);
    }
  }
  const conflicts: ProfileFact[][] = [];
  for (const group of groups.values()) {
    const values = new Set(group.map(fact => String(fact.claim.value)));
    if (values.size > 1) conflicts.push(group);
  }
  return conflicts;
}

interface WindowRange {
  readonly start: number;
  readonly end: number;
}

function windowRange(fact: ProfileFact): WindowRange {
  const start = fact.claim.window?.start
    ? Date.parse(fact.claim.window.start)
    : Number.NEGATIVE_INFINITY;
  const end = fact.claim.window?.end
    ? Date.parse(fact.claim.window.end)
    : Number.POSITIVE_INFINITY;
  return { start, end };
}

export interface MetricAggregate {
  readonly value: number;
  readonly unit: string;
  readonly basis: string;
  readonly factIds: readonly string[];
}

// No double-counting: overlapping windows take cluster max, then sum
// disjoint clusters; windowless facts collapse into the all-overlap cluster.
export function aggregateMetric(
  facts: readonly ProfileFact[],
  subjectEntityId: string,
  predicate: string,
  unit: string
): MetricAggregate {
  const relevant = facts
    .filter(
      fact =>
        fact.subjectEntityId === subjectEntityId &&
        fact.claim.kind === 'metric' &&
        fact.claim.predicate === predicate &&
        fact.claim.unit === unit &&
        fact.status === 'verified' &&
        typeof fact.claim.value === 'number'
    )
    .sort((a, b) => windowRange(a).start - windowRange(b).start);

  const clusters: { end: number; max: number; factIds: string[] }[] = [];
  for (const fact of relevant) {
    const range = windowRange(fact);
    const value = fact.claim.value as number;
    const last = clusters[clusters.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      last.max = Math.max(last.max, value);
      last.factIds.push(fact.id);
    } else {
      clusters.push({ end: range.end, max: value, factIds: [fact.id] });
    }
  }

  return {
    value: clusters.reduce((sum, cluster) => sum + cluster.max, 0),
    unit,
    basis: 'deduped-max-overlap',
    factIds: relevant.map(fact => fact.id),
  };
}

export function registerDerivative(
  id: string,
  copy: DerivativeRecord['copy'],
  at: string
): DerivativeRecord {
  const detail = `generated ${copy.surface} for ${copy.subjectEntityId} from ${copy.sentences.reduce((n, s) => n + s.factIds.length, 0)} fact bindings`;
  return {
    id,
    copy,
    status: 'active',
    history: [{ at, event: 'generated', detail }],
  };
}

// Consumed fact revocation/contradiction/staleness marks the derivative
// for reapproval; the original copy stays intact for audit.
export function applyFactChanges(
  derivative: DerivativeRecord,
  facts: readonly ProfileFact[],
  at: string
): DerivativeRecord {
  if (derivative.status !== 'active') return derivative;

  const usedFactIds = new Set(
    derivative.copy.sentences.flatMap(sentence => sentence.factIds)
  );
  const events: AuditEvent[] = [];
  const eventFor: Record<string, AuditEvent['event']> = {
    revoked: 'fact-revoked',
    contradicted: 'fact-contradicted',
    stale: 'fact-stale',
  };

  for (const fact of facts) {
    if (!usedFactIds.has(fact.id)) continue;
    const event = eventFor[fact.status];
    if (event) {
      events.push({
        at,
        event,
        detail: `fact ${fact.id} became ${fact.status}`,
      });
    }
  }

  if (events.length === 0) return derivative;
  return {
    ...derivative,
    status: 'needs-reapproval',
    history: [
      ...derivative.history,
      ...events,
      {
        at,
        event: 'marked-for-reapproval',
        detail: `${events.length} consumed fact(s) changed state`,
      },
    ],
  };
}

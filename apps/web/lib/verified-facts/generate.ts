import {
  aggregateMetric,
  isPublicationEligible,
  type MetricAggregate,
} from './registry';
import type {
  CopySurface,
  GeneratedCopy,
  GeneratedSentence,
  OmittedClaim,
  ProfileFact,
  SubjectEntity,
} from './types';

const SURFACE_ORDER: Record<CopySurface, readonly string[]> = {
  boilerplate: ['role', 'metric', 'award', 'membership', 'identifier'],
  bio: ['role', 'identifier', 'metric', 'award', 'membership'],
  pitch: ['metric', 'role', 'award', 'membership', 'identifier'],
};

function article(value: string): string {
  return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

function omissionReason(fact: ProfileFact): OmittedClaim['reason'] {
  if (fact.status === 'contradicted') return 'contradicted';
  if (fact.status === 'stale') return 'stale';
  if (fact.status === 'revoked') return 'revoked';
  if (fact.status !== 'verified') return 'unverified';
  if (!fact.approval.approved) return 'not-approved';
  return 'not-permitted';
}

function renderSentence(
  fact: ProfileFact,
  subject: SubjectEntity,
  aggregates: Map<string, MetricAggregate>
): GeneratedSentence | null {
  const { claim } = fact;
  const name = subject.name;

  if (fact.approval.approvedWording) {
    return { text: fact.approval.approvedWording, factIds: [fact.id] };
  }

  switch (claim.kind) {
    case 'role':
      return {
        text: `${name} is ${article(String(claim.value))} ${claim.value}${claim.qualifier ? ` of ${claim.qualifier}` : ''}.`,
        factIds: [fact.id],
      };
    case 'membership':
      return {
        text: `${name} is a member of ${claim.value}.`,
        factIds: [fact.id],
      };
    case 'award':
      return {
        text: `${name} was ${claim.qualifier ?? 'recognized'} for ${claim.value}.`,
        factIds: [fact.id],
      };
    case 'metric': {
      const aggregate = aggregates.get(`${claim.predicate}:${claim.unit}`);
      const display =
        claim.displayValue ??
        (aggregate ? aggregate.value : claim.value).toLocaleString('en-US');
      return {
        text: `${name}'s work has reached ${display} ${claim.unit ?? ''}.`.replace(
          /\s+\./,
          '.'
        ),
        factIds: aggregate ? aggregate.factIds : [fact.id],
      };
    }
    case 'identifier':
      if (claim.predicate === 'public-profile') {
        return {
          text: `${name}'s official profile is ${claim.value}.`,
          factIds: [fact.id],
        };
      }
      return null;
    default:
      return null;
  }
}

// Reject paraphrase that strengthens a claim: numeric inflation,
// award-outcome upgrades, injected superlatives.
export function validateParaphrase(
  text: string,
  fact: ProfileFact
): readonly string[] {
  const violations: string[] = [];
  const { claim } = fact;
  const lower = text.toLowerCase();

  if (typeof claim.value === 'number') {
    for (const match of lower.matchAll(
      /\b(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand)?\b/g
    )) {
      const scale =
        match[2] === 'million'
          ? 1_000_000
          : match[2] === 'billion'
            ? 1_000_000_000
            : match[2] === 'thousand'
              ? 1_000
              : 1;
      const stated = Number.parseFloat(match[1].replace(/,/g, '')) * scale;
      // Any stated number above the evidenced value inflates the claim.
      if (stated > claim.value) {
        violations.push(
          `numeric inflation: states ${stated} ${claim.unit ?? ''} but evidence supports ${claim.value}`
        );
      }
    }
  }

  if (
    claim.kind === 'award' &&
    claim.qualifier === 'nominated' &&
    /\b(won|winner|winning|recipient|awarded)\b/.test(lower)
  ) {
    violations.push('award upgrade: evidence supports a nomination, not a win');
  }

  if (/\b(sole|only ever|first[- ]ever|best)\b/.test(lower)) {
    violations.push('injected superlative not present in evidence');
  }

  return violations;
}

export interface GenerateCopyInput {
  readonly subject: SubjectEntity;
  readonly facts: readonly ProfileFact[];
  readonly surface: CopySurface;
  readonly maxSentences?: number;
}

// All surfaces consume the same eligible facts; ordering differs per
// surface. Unsupported facts are omitted with reasons, never invented.
export function generateProfileCopy(input: GenerateCopyInput): GeneratedCopy {
  const { subject, facts, surface } = input;
  const subjectFacts = facts.filter(
    fact => fact.subjectEntityId === subject.entityId
  );

  const eligible = subjectFacts.filter(isPublicationEligible);
  const omitted: OmittedClaim[] = subjectFacts
    .filter(fact => !isPublicationEligible(fact))
    .map(fact => ({ factId: fact.id, reason: omissionReason(fact) }));

  // Precompute metric aggregates so overlapping sources are counted once.
  const aggregates = new Map<string, MetricAggregate>();
  for (const fact of eligible) {
    if (fact.claim.kind === 'metric' && fact.claim.unit) {
      const key = `${fact.claim.predicate}:${fact.claim.unit}`;
      if (!aggregates.has(key)) {
        aggregates.set(
          key,
          aggregateMetric(
            facts,
            subject.entityId,
            fact.claim.predicate,
            fact.claim.unit
          )
        );
      }
    }
  }

  const order = SURFACE_ORDER[surface];
  const sorted = [...eligible].sort(
    (a, b) => order.indexOf(a.claim.kind) - order.indexOf(b.claim.kind)
  );

  const seenMetric = new Set<string>();
  const sentences: GeneratedSentence[] = [];
  for (const fact of sorted) {
    // Render each metric predicate once, from its deduped aggregate.
    if (fact.claim.kind === 'metric') {
      const key = `${fact.claim.predicate}:${fact.claim.unit}`;
      if (seenMetric.has(key)) continue;
      seenMetric.add(key);
    }
    const sentence = renderSentence(fact, subject, aggregates);
    if (!sentence) continue;
    const violations = sentence.factIds
      .map(id => facts.find(candidate => candidate.id === id))
      .filter((f): f is ProfileFact => Boolean(f))
      .flatMap(f => validateParaphrase(sentence.text, f));
    if (violations.length > 0) {
      omitted.push({ factId: fact.id, reason: 'not-approved' });
      continue;
    }
    sentences.push(sentence);
    if (input.maxSentences && sentences.length >= input.maxSentences) break;
  }

  return {
    surface,
    subjectEntityId: subject.entityId,
    sentences,
    text: sentences.map(sentence => sentence.text).join(' '),
    omitted,
  };
}

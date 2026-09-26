/**
 * Verified profile facts → bios and press boilerplate (JOV-6344).
 * `subjectEntityId`/`evidence[].sourceRecordId` reuse canonical memory
 * entity/source-record ids. Generation paraphrases supported facts only:
 * it never strengthens a claim, infers publication permission, or treats
 * confidence as verification. Approval, verification, and permission are
 * separate gates.
 */

export type ProfileFactStatus =
  | 'candidate'
  | 'verified'
  | 'contradicted'
  | 'stale'
  | 'revoked';

export type PublicationPermission = 'none' | 'internal' | 'public';

export type ProfileFactKind =
  | 'role'
  | 'membership'
  | 'metric'
  | 'release_credit'
  | 'award'
  | 'profile';

export interface ProfileFactEvidence {
  /** memory_source_records.id */
  readonly sourceRecordId: string;
  readonly locator: string;
  readonly note?: string;
}

export interface ProfileFact {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly subjectStatus: 'candidate' | 'confirmed' | 'rejected' | 'merged';
  readonly kind: ProfileFactKind;
  /** Specific role/relationship, e.g. 'founder_of'. */
  readonly predicate: string;
  /** Related entity/object display name, e.g. 'Jovie'. */
  readonly object?: string;
  readonly value?: number;
  readonly unit?: string;
  readonly window?: string;
  /** Exact claim as supported by the evidence. */
  readonly claim: string;
  readonly evidence: readonly ProfileFactEvidence[];
  readonly observedAt: string;
  readonly verifiedAt?: string;
  readonly limitations?: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
  readonly status: ProfileFactStatus;
  readonly publication: PublicationPermission;
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * Public-surface gate: confirmed subject + verified claim + explicit public
 * permission + cited source records. Anything less is omitted, not softened.
 */
export function isPublicationEligible(fact: ProfileFact): boolean {
  return (
    fact.subjectStatus === 'confirmed' &&
    fact.status === 'verified' &&
    fact.publication === 'public' &&
    fact.evidence.length > 0 &&
    fact.evidence.every(ref => ref.sourceRecordId.length > 0)
  );
}

function omissionReason(fact: ProfileFact): string {
  if (fact.subjectStatus !== 'confirmed')
    return `subject entity is ${fact.subjectStatus}, not confirmed`;
  if (fact.status !== 'verified') return `fact status is ${fact.status}`;
  if (fact.publication !== 'public')
    return `publication permission is ${fact.publication}`;
  return 'no source-record evidence';
}

export function selectEligibleFacts(facts: readonly ProfileFact[]): {
  eligible: ProfileFact[];
  omitted: { fact: ProfileFact; reason: string }[];
} {
  const eligible: ProfileFact[] = [];
  const omitted: { fact: ProfileFact; reason: string }[] = [];
  for (const fact of facts) {
    if (isPublicationEligible(fact)) eligible.push(fact);
    else omitted.push({ fact, reason: omissionReason(fact) });
  }
  return { eligible, omitted };
}

/** Overlapping metrics are never summed; keep one best fact per key. */
export function dedupeMetrics(
  facts: readonly ProfileFact[]
): readonly ProfileFact[] {
  const best = new Map<string, ProfileFact>();
  const rest: ProfileFact[] = [];
  for (const fact of facts) {
    if (fact.kind !== 'metric') {
      rest.push(fact);
      continue;
    }
    const key = `${fact.predicate} ${fact.unit ?? ''}`;
    const current = best.get(key);
    if (
      !current ||
      CONFIDENCE_RANK[fact.confidence] > CONFIDENCE_RANK[current.confidence] ||
      (fact.confidence === current.confidence &&
        (fact.verifiedAt ?? fact.observedAt) >
          (current.verifiedAt ?? current.observedAt))
    ) {
      best.set(key, fact);
    }
  }
  return [...rest, ...best.values()];
}

export type BoilerplateAudience = 'press' | 'investor' | 'general';

const AUDIENCE_KINDS: Record<BoilerplateAudience, readonly ProfileFactKind[]> =
  {
    press: ['profile', 'role', 'release_credit', 'metric', 'award'],
    investor: ['profile', 'role', 'membership', 'metric'],
    general: ['profile', 'role', 'membership', 'release_credit', 'metric'],
  };

/** Recipient relevance filter; never edits fact fields. */
export function selectFactsForAudience(
  facts: readonly ProfileFact[],
  audience: BoilerplateAudience = 'general'
): readonly ProfileFact[] {
  return dedupeMetrics(selectEligibleFacts(facts).eligible).filter(fact =>
    AUDIENCE_KINDS[audience].includes(fact.kind)
  );
}

export interface BoilerplateSentence {
  readonly text: string;
  /** Fact ids this sentence paraphrases; traceability to evidence. */
  readonly factIds: readonly string[];
}

export interface GeneratedBoilerplate {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly subjectName: string;
  readonly audience: BoilerplateAudience;
  readonly sentences: readonly BoilerplateSentence[];
  readonly text: string;
  readonly omittedFactIds: readonly string[];
  readonly generatedAt: string;
  readonly status: 'draft' | 'approved' | 'needs_reapproval' | 'withdrawn';
}

const ROLE_LABELS: Record<string, string> = {
  founder_of: 'founder of',
  artist_on: 'artist',
  member_of: 'member of',
};

function renderSentence(
  subjectName: string,
  fact: ProfileFact
): BoilerplateSentence | null {
  const factIds = [fact.id];
  const role = ROLE_LABELS[fact.predicate] ?? fact.predicate;
  const join = (...parts: (string | undefined)[]) =>
    `${parts.filter(Boolean).join(' ')}.`;
  switch (fact.kind) {
    case 'role':
    case 'membership':
      return {
        text: join(
          subjectName,
          'is',
          fact.kind === 'role' ? 'the' : 'a',
          role,
          fact.object
        ),
        factIds,
      };
    case 'metric': {
      const value = fact.unit ? `${fact.value} ${fact.unit}` : `${fact.value}`;
      const window = fact.window ? ` (${fact.window})` : '';
      return {
        text: `${fact.object ?? 'The catalog'} has ${value}${window}.`,
        factIds,
      };
    }
    case 'release_credit':
      return {
        text: join(
          subjectName,
          'is credited as',
          role.replace(/ of$/, ''),
          'on',
          fact.object
        ),
        factIds,
      };
    case 'award':
    case 'profile':
      return {
        text: fact.claim.endsWith('.') ? fact.claim : `${fact.claim}.`,
        factIds,
      };
    default:
      return null;
  }
}

/**
 * Render a short bio/press boilerplate from publication-eligible facts for
 * one subject. Unsupported facts are omitted, never paraphrased in.
 */
export function generateBoilerplate(input: {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly subjectName: string;
  readonly audience?: BoilerplateAudience;
  readonly facts: readonly ProfileFact[];
  readonly generatedAt: string;
}): GeneratedBoilerplate {
  const audience = input.audience ?? 'general';
  const selected = selectFactsForAudience(
    input.facts.filter(fact => fact.subjectEntityId === input.subjectEntityId),
    audience
  );
  const sentences: BoilerplateSentence[] = [];
  const used = new Set<string>();
  for (const fact of selected) {
    const sentence = renderSentence(input.subjectName, fact);
    if (sentence) {
      sentences.push(sentence);
      used.add(fact.id);
    }
  }
  return {
    id: input.id,
    subjectEntityId: input.subjectEntityId,
    subjectName: input.subjectName,
    audience,
    sentences,
    text: sentences.map(s => s.text).join(' '),
    omittedFactIds: input.facts
      .filter(fact => !used.has(fact.id))
      .map(fact => fact.id),
    generatedAt: input.generatedAt,
    status: 'draft',
  };
}

/**
 * Mark a derivative `needs_reapproval` when any paraphrased fact lost
 * publication eligibility; prior versions are kept by callers for audit.
 */
export function revalidateBoilerplate(
  artifact: GeneratedBoilerplate,
  currentFacts: readonly ProfileFact[]
): GeneratedBoilerplate {
  if (artifact.status === 'withdrawn') return artifact;
  const byId = new Map(currentFacts.map(fact => [fact.id, fact]));
  const supported = artifact.sentences.every(sentence =>
    sentence.factIds.every(id => {
      const fact = byId.get(id);
      return fact !== undefined && isPublicationEligible(fact);
    })
  );
  return supported ? artifact : { ...artifact, status: 'needs_reapproval' };
}

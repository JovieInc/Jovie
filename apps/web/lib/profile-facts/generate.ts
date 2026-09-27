import {
  derivativeStatusForFacts,
  eligibleFactsForSubject,
  factEligibility,
} from './facts';
import type {
  DerivativeRecord,
  GeneratedProfileCopy,
  GeneratedSentence,
  OmittedFact,
  ProfileAudience,
  ProfileFact,
  ProfileFactKind,
} from './types';

/**
 * Audience relevance ordering. Selection changes which facts appear, never the
 * facts themselves, and never implies an endorsement by a cited party.
 */
const AUDIENCE_KIND_ORDER: Record<ProfileAudience, readonly ProfileFactKind[]> =
  {
    press: [
      'role',
      'affiliation',
      'accomplishment',
      'identity',
      'relationship',
      'metric',
    ],
    investor: [
      'role',
      'accomplishment',
      'metric',
      'affiliation',
      'identity',
      'relationship',
    ],
    fan: [
      'identity',
      'relationship',
      'accomplishment',
      'role',
      'affiliation',
      'metric',
    ],
    generic: [
      'role',
      'identity',
      'affiliation',
      'relationship',
      'accomplishment',
      'metric',
    ],
  };

function sentenceText(fact: ProfileFact): string {
  const raw = fact.approvedWording ?? fact.claim;
  return raw.endsWith('.') ? raw : `${raw}.`;
}

export interface GenerateProfileCopyInput {
  readonly subjectEntityId: string;
  readonly facts: readonly ProfileFact[];
  readonly audience: ProfileAudience;
  readonly maxSentences?: number;
}

/**
 * Build a short bio / press boilerplate from eligible facts only. Every
 * emitted sentence carries `factIds` for sentence-to-evidence traceability;
 * unsupported or unpublished claims are omitted, not completed.
 */
export function generateProfileCopy(
  input: GenerateProfileCopyInput
): GeneratedProfileCopy {
  const { eligible, omitted } = eligibleFactsForSubject(
    input.subjectEntityId,
    input.facts
  );

  const order = AUDIENCE_KIND_ORDER[input.audience];
  const rank = (fact: ProfileFact) => order.indexOf(fact.kind);
  const selected = [...eligible].sort((a, b) => rank(a) - rank(b));
  const limit = input.maxSentences ?? selected.length;
  const used = selected.slice(0, limit);

  const usedIds = new Set(used.map(fact => fact.id));
  const dropped: OmittedFact[] = eligible
    .filter(fact => !usedIds.has(fact.id))
    .map(fact => ({ factId: fact.id, reason: 'not_relevant' as const }));

  const sentences: GeneratedSentence[] = used.map(fact => ({
    text: sentenceText(fact),
    factIds: [fact.id],
  }));

  return {
    subjectEntityId: input.subjectEntityId,
    audience: input.audience,
    sentences,
    omitted: [...omitted, ...dropped],
  };
}

export type DerivativeAuditIssue =
  | { readonly kind: 'missing_fact_ids'; readonly sentence: string }
  | {
      readonly kind: 'ineligible_fact';
      readonly factId: string;
      readonly sentence: string;
    }
  | {
      readonly kind: 'unsupported_numeric';
      readonly sentence: string;
      readonly value: number;
    };

function numericTokens(text: string): number[] {
  const matches = text.replaceAll(',', '').match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(token => Number(token)) : [];
}

/**
 * Verify a generated derivative stays inside its evidence: every sentence is
 * traceable, every cited fact is still publishable, and no numeric literal in
 * the text exceeds the exact value of a supporting fact (deliberate display
 * rounding lives in the claim text; `value` stays exact underneath).
 */
export function auditGeneratedCopy(
  copy: GeneratedProfileCopy,
  factsById: ReadonlyMap<string, ProfileFact>
): DerivativeAuditIssue[] {
  const issues: DerivativeAuditIssue[] = [];

  for (const sentence of copy.sentences) {
    if (sentence.factIds.length === 0) {
      issues.push({ kind: 'missing_fact_ids', sentence: sentence.text });
      continue;
    }

    const supporting = sentence.factIds
      .map(id => factsById.get(id))
      .filter((fact): fact is ProfileFact => fact !== undefined);

    for (const factId of sentence.factIds) {
      const fact = factsById.get(factId);
      if (!fact || !factEligibility(fact).eligible) {
        issues.push({
          kind: 'ineligible_fact',
          factId,
          sentence: sentence.text,
        });
      }
    }

    const supportedValues = new Set(
      supporting
        .map(fact => fact.value)
        .filter((value): value is number => value !== undefined)
    );
    for (const token of numericTokens(sentence.text)) {
      // Numbers appearing in the claim text itself are supported by that fact.
      const inClaimText = supporting.some(fact =>
        numericTokens(fact.claim).includes(token)
      );
      if (!inClaimText && !supportedValues.has(token)) {
        issues.push({
          kind: 'unsupported_numeric',
          sentence: sentence.text,
          value: token,
        });
      }
    }
  }

  return issues;
}

export interface RecordDerivativeInput {
  readonly id: string;
  readonly kind: DerivativeRecord['kind'];
  readonly copy: GeneratedProfileCopy;
  readonly generatedAt: string;
}

/** Create a derivative record whose first version is the generated copy. */
export function recordDerivative(
  input: RecordDerivativeInput
): DerivativeRecord {
  const factIds = [
    ...new Set(input.copy.sentences.flatMap(sentence => sentence.factIds)),
  ];
  return {
    id: input.id,
    kind: input.kind,
    subjectEntityId: input.copy.subjectEntityId,
    status: 'active',
    factIds,
    versions: [
      { version: 1, generatedAt: input.generatedAt, copy: input.copy },
    ],
  };
}

/**
 * Reconcile a stored derivative against current fact state. Withdrawn /
 * reapproval transitions keep prior versions intact for audit.
 */
export function reconcileDerivative(
  record: DerivativeRecord,
  factsById: ReadonlyMap<string, ProfileFact>
): DerivativeRecord {
  return {
    ...record,
    status: derivativeStatusForFacts(record.factIds, factsById),
  };
}

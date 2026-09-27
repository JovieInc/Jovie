import { describe, expect, it } from 'vitest';
import {
  eligibleFactsForSubject,
  factEligibility,
  resolveSubject,
} from './facts';
import {
  OTHER_TIM_SUBJECT_ENTITY_ID,
  TIM_SUBJECT_ENTITY_ID,
  timBoilerplate,
  timBoilerplateRecord,
  timFacts,
  timSubjects,
} from './fixtures';
import {
  auditGeneratedCopy,
  generateProfileCopy,
  reconcileDerivative,
} from './generate';
import type { ProfileFact } from './types';

const byId = (facts: readonly ProfileFact[]) =>
  new Map(facts.map(fact => [fact.id, fact]));

const base: ProfileFact = {
  id: 'f1',
  subjectEntityId: TIM_SUBJECT_ENTITY_ID,
  kind: 'accomplishment',
  claim: 'x',
  evidence: [
    {
      sourceRecordId: 'sr1',
      locator: 'loc',
      observedAt: '2026-09-16T00:00:00Z',
    },
  ],
  status: 'verified',
  permission: 'public',
};

describe('factEligibility', () => {
  it('requires verified status, public permission, and evidence', () => {
    expect(factEligibility(base)).toEqual({ eligible: true });
    expect(factEligibility({ ...base, status: 'candidate' })).toEqual({
      eligible: false,
      reason: 'not_verified',
    });
    expect(factEligibility({ ...base, permission: 'private' })).toEqual({
      eligible: false,
      reason: 'not_permitted',
    });
    expect(factEligibility({ ...base, evidence: [] })).toEqual({
      eligible: false,
      reason: 'no_evidence',
    });
  });

  it('approved wording does not verify an unsupported claim', () => {
    const fact = {
      ...base,
      status: 'candidate' as const,
      approvedWording: 'A Grammy-nominated artist',
    };
    expect(factEligibility(fact)).toEqual({
      eligible: false,
      reason: 'not_verified',
    });
  });
});

describe('resolveSubject', () => {
  it('resolves a unique alias to the canonical entity', () => {
    expect(resolveSubject(timSubjects, 'timwhite')).toEqual({
      outcome: 'resolved',
      entityId: TIM_SUBJECT_ENTITY_ID,
    });
  });

  it('returns ambiguous for a shared name rather than guessing', () => {
    const result = resolveSubject(timSubjects, 'Tim White');
    expect(result.outcome).toBe('ambiguous');
  });

  it('ignores entities that are not confirmed', () => {
    const result = resolveSubject(
      [{ entityId: 'e1', name: 'Tim White', status: 'candidate' }],
      'Tim White'
    );
    expect(result.outcome).toBe('unknown');
  });
});

describe('generateProfileCopy', () => {
  it('traces every boilerplate sentence to a fact and audits clean', () => {
    expect(timBoilerplate.sentences.length).toBeGreaterThan(0);
    for (const sentence of timBoilerplate.sentences) {
      expect(sentence.factIds.length).toBeGreaterThan(0);
    }
    expect(auditGeneratedCopy(timBoilerplate, byId(timFacts))).toEqual([]);
  });

  it('omits unverified, private, and wrong-subject facts', () => {
    const wrongSubject: ProfileFact = {
      ...base,
      id: 'wrong_person',
      subjectEntityId: OTHER_TIM_SUBJECT_ENTITY_ID,
      claim: 'Tim White won a major golf championship',
    };
    const copy = generateProfileCopy({
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      facts: [...timFacts, wrongSubject],
      audience: 'press',
    });
    const reasons = new Map(copy.omitted.map(o => [o.factId, o.reason]));
    expect(reasons.get('fact_tim_streams_unverified')).toBe('not_verified');
    expect(reasons.get('fact_tim_private_note')).toBe('not_permitted');
    expect(reasons.get('wrong_person')).toBe('wrong_subject');
    expect(copy.sentences.map(s => s.text).join(' ')).not.toContain(
      '70 million'
    );
  });

  it('does not sum overlapping metric sources into an inflated aggregate', () => {
    const spotify: ProfileFact = {
      ...base,
      id: 'streams_spotify',
      kind: 'metric',
      claim: 'Tim White has 40 million Spotify streams',
      value: 40_000_000,
      unit: 'streams',
    };
    const apple: ProfileFact = {
      ...base,
      id: 'streams_apple',
      kind: 'metric',
      claim: 'Tim White has 35 million Apple Music streams',
      value: 35_000_000,
      unit: 'streams',
      limitations: 'Overlaps with Spotify listeners; not additive.',
    };
    const copy = generateProfileCopy({
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      facts: [spotify, apple],
      audience: 'investor',
    });
    const text = copy.sentences.map(s => s.text).join(' ');
    expect(text).not.toContain('75');
    expect(auditGeneratedCopy(copy, byId([spotify, apple]))).toEqual([]);
  });

  it('flags an embellishing paraphrase with an unsupported number', () => {
    const copy = generateProfileCopy({
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      facts: timFacts,
      audience: 'press',
    });
    const embellished = {
      ...copy,
      sentences: [
        ...copy.sentences,
        {
          text: 'He has over 70 million streams.',
          factIds: ['fact_tim_founder_jovie'],
        },
        { text: 'He is Grammy-nominated.', factIds: [] },
      ],
    };
    const issues = auditGeneratedCopy(embellished, byId(timFacts));
    expect(issues).toContainEqual({
      kind: 'unsupported_numeric',
      sentence: 'He has over 70 million streams.',
      value: 70,
    });
    expect(issues).toContainEqual({
      kind: 'missing_fact_ids',
      sentence: 'He is Grammy-nominated.',
    });
  });
});

describe('derivative lifecycle', () => {
  it('marks derivatives for reapproval when a fact goes stale', () => {
    const stale = byId(timFacts);
    stale.set('fact_tim_artist', {
      ...timFacts[1],
      status: 'stale',
    });
    expect(reconcileDerivative(timBoilerplateRecord, stale).status).toBe(
      'needs_reapproval'
    );
    expect(timBoilerplateRecord.versions).toHaveLength(1);
  });

  it('withdraws derivatives when a fact is revoked or contradicted', () => {
    const revoked = byId(timFacts);
    revoked.set('fact_tim_founder_jovie', {
      ...timFacts[0],
      status: 'revoked',
    });
    const record = reconcileDerivative(timBoilerplateRecord, revoked);
    expect(record.status).toBe('withdrawn');
    expect(record.versions).toHaveLength(1);
  });

  it('marks derivatives for reapproval when permission narrows', () => {
    const narrowed = byId(timFacts);
    narrowed.set('fact_jovie_platform', {
      ...timFacts[2],
      permission: 'internal',
    });
    expect(reconcileDerivative(timBoilerplateRecord, narrowed).status).toBe(
      'needs_reapproval'
    );
  });
});

describe('eligibleFactsForSubject', () => {
  it('keeps exact values under deliberately rounded display claims', () => {
    const rounded: ProfileFact = {
      ...base,
      id: 'rounded_metric',
      kind: 'metric',
      claim: 'Tim White has tens of millions of streams',
      value: 40_137_882,
      unit: 'streams',
    };
    const { eligible } = eligibleFactsForSubject(TIM_SUBJECT_ENTITY_ID, [
      rounded,
    ]);
    expect(eligible[0].value).toBe(40_137_882);
  });
});

import { describe, expect, it } from 'vitest';
import {
  aggregateMetric,
  eligibleFacts,
  isPublicationEligible,
} from './eligibility';
import {
  assessArtifact,
  generateProfileText,
  sentenceForFact,
  validateSentence,
} from './generate';
import { TIM_ENTITY_ID, TIM_VERIFIED_FACTS } from './tim-facts';
import type { GeneratedArtifact, VerifiedFact } from './types';

const base: VerifiedFact = {
  id: 'fact_base',
  subjectEntityId: TIM_ENTITY_ID,
  role: 'artist',
  claim: { kind: 'metric', text: 'x', scope: 'subject' },
  evidence: [{ sourceRecordId: 'src_a', location: 'loc' }],
  observedAt: '2026-09-01',
  limitations: [],
  confidence: 'high',
  status: 'verified',
  publicationPermission: 'granted',
};

const fact = (overrides: Partial<VerifiedFact>): VerifiedFact => ({
  ...base,
  ...overrides,
});

describe('publication eligibility', () => {
  it('requires verified status, granted permission, and evidence', () => {
    expect(isPublicationEligible(base)).toBe(true);
    expect(isPublicationEligible(fact({ status: 'candidate' }))).toBe(false);
    expect(
      isPublicationEligible(fact({ publicationPermission: 'private' }))
    ).toBe(false);
    expect(
      isPublicationEligible(fact({ publicationPermission: 'revoked' }))
    ).toBe(false);
    expect(isPublicationEligible(fact({ evidence: [] }))).toBe(false);
  });

  it('approved wording does not verify an unsupported claim', () => {
    const approvedOnly = fact({
      status: 'candidate',
      approvedText: 'Grammy-nominated artist.',
    });
    expect(isPublicationEligible(approvedOnly)).toBe(false);
  });

  it('high model confidence does not substitute for verification', () => {
    expect(
      isPublicationEligible(fact({ status: 'candidate', confidence: 'high' }))
    ).toBe(false);
  });
});

describe('eligibleFacts', () => {
  it('excludes wrong-person matches', () => {
    const other = fact({ id: 'other', subjectEntityId: 'ent_other_tim' });
    const { eligible } = eligibleFacts([base, other], TIM_ENTITY_ID);
    expect(eligible.map(f => f.id)).toEqual(['fact_base']);
  });

  it('does not double-count overlapping stream sources', () => {
    const spotify = fact({
      id: 's1',
      claim: {
        kind: 'metric',
        text: 'streams',
        value: 40_000_000,
        unit: 'streams',
        scope: 'subject',
      },
      dedupeKey: 'catalog-streams',
      observedAt: '2026-08-01',
    });
    const apple = fact({
      id: 's2',
      claim: {
        kind: 'metric',
        text: 'streams',
        value: 30_000_000,
        unit: 'streams',
        scope: 'subject',
      },
      dedupeKey: 'catalog-streams',
      observedAt: '2026-09-01',
    });
    const { eligible, omitted } = eligibleFacts(
      [spotify, apple],
      TIM_ENTITY_ID
    );
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('s2');
    expect(omitted).toEqual([{ factId: 's1', reason: 'duplicate-source' }]);
  });
});

describe('aggregateMetric', () => {
  it('sums distinct sources but not overlapping ones', () => {
    const a = fact({
      id: 'a',
      claim: { kind: 'metric', text: 'x', value: 10, unit: 'streams' },
      dedupeKey: 'k1',
    });
    const b = fact({
      id: 'b',
      claim: { kind: 'metric', text: 'x', value: 20, unit: 'streams' },
      dedupeKey: 'k2',
    });
    const c = fact({
      id: 'c',
      claim: { kind: 'metric', text: 'x', value: 99, unit: 'streams' },
      dedupeKey: 'k1',
      observedAt: '2025-01-01',
    });
    expect(aggregateMetric([a, b, c], TIM_ENTITY_ID, 'streams')?.value).toBe(
      30
    );
  });

  it('never counts company acquisition value as founder proceeds', () => {
    const exit = fact({
      id: 'exit',
      role: 'founder',
      claim: {
        kind: 'exit',
        text: 'acquired',
        value: 50_000_000,
        unit: 'usd',
        scope: 'organization',
      },
    });
    expect(aggregateMetric([exit], TIM_ENTITY_ID, 'usd')).toBeNull();
  });
});

describe('generateProfileText', () => {
  it('produces Tim boilerplate with sentence-to-evidence traceability', () => {
    const result = generateProfileText(TIM_VERIFIED_FACTS, TIM_ENTITY_ID);
    expect(result.sentences.length).toBe(3);
    for (const sentence of result.sentences) {
      expect(sentence.factIds.length).toBeGreaterThan(0);
      expect(sentence.sourceRecordIds.length).toBeGreaterThan(0);
      expect(validateSentence(sentence, TIM_VERIFIED_FACTS)).toEqual([]);
    }
    expect(result.text).toContain('founder of Jovie');
    expect(result.text).toContain('jov.ie/tim');
  });

  it('omits contradicted, stale, revoked, and unpermitted facts with reasons', () => {
    const facts = [
      base,
      fact({ id: 'c', status: 'contradicted' }),
      fact({ id: 's', status: 'stale' }),
      fact({ id: 'r', status: 'revoked' }),
      fact({ id: 'p', publicationPermission: 'private' }),
    ];
    const { omitted } = generateProfileText(facts, TIM_ENTITY_ID);
    const reasons = Object.fromEntries(omitted.map(o => [o.factId, o.reason]));
    expect(reasons).toEqual({
      c: 'contradicted',
      s: 'stale',
      r: 'revoked',
      p: 'no-publication-permission',
    });
  });

  it('withholds private-source facts unless explicitly permitted', () => {
    const privateFact = fact({
      id: 'priv',
      evidence: [
        { sourceRecordId: 'src_gmail', location: 'email', privateSource: true },
      ],
      publicationPermission: 'private',
    });
    const { sentences, omitted } = generateProfileText(
      [privateFact],
      TIM_ENTITY_ID
    );
    expect(sentences).toHaveLength(0);
    expect(omitted[0].reason).toBe('no-publication-permission');
  });

  it('does not attribute a recording award to every contributor', () => {
    const award = fact({
      id: 'award',
      role: 'mixer',
      claim: {
        kind: 'award',
        text: 'Grammy-nominated recording.',
        attributableRole: 'artist',
      },
    });
    const { sentences, omitted } = generateProfileText([award], TIM_ENTITY_ID);
    expect(sentences).toHaveLength(0);
    expect(omitted[0].reason).toBe('wrong-subject');
  });

  it('keeps exact data exact underneath deliberately rounded display', () => {
    const metric = fact({
      id: 'm',
      claim: {
        kind: 'metric',
        text: 'Career streams',
        value: 71_234_567,
        unit: 'streams',
      },
    });
    const displayRounding = (v: number) => `${Math.round(v / 1e6)}M`;
    const sentence = sentenceForFact(metric, { displayRounding });
    expect(metric.claim.value).toBe(71_234_567);
    expect(sentence.text).toContain('71M');
    expect(validateSentence(sentence, [metric], { displayRounding })).toEqual(
      []
    );
  });

  it('rejects embellishing paraphrases', () => {
    const sentence = sentenceForFact(base);
    const embellished = { ...sentence, text: 'x 70000000 streams' };
    expect(validateSentence(embellished, [base]).length).toBeGreaterThan(0);
  });
});

describe('assessArtifact', () => {
  const artifact: GeneratedArtifact = {
    id: 'art1',
    subjectEntityId: TIM_ENTITY_ID,
    createdAt: '2026-09-01',
    approvedAt: '2026-09-01',
    text: 'Tim White is the founder of Jovie.',
    sentences: [
      {
        text: 'Tim White is the founder of Jovie.',
        factIds: ['fact_base'],
        sourceRecordIds: ['src_a'],
      },
    ],
    auditTrail: [
      {
        at: '2026-09-01',
        state: 'current',
        reason: 'generated',
        affectedFactIds: [],
      },
    ],
  };

  it('withdraws derivatives when a backing fact is revoked or contradicted', () => {
    const { state, artifact: next } = assessArtifact(
      artifact,
      [fact({ status: 'revoked' })],
      '2026-09-20'
    );
    expect(state).toBe('withdrawn');
    expect(next.auditTrail).toHaveLength(2);
    expect(next.auditTrail[1].state).toBe('withdrawn');
    expect(next.auditTrail[0].state).toBe('current'); // history retained
  });

  it('marks derivatives for reapproval when permission is revoked', () => {
    const { state } = assessArtifact(
      artifact,
      [fact({ publicationPermission: 'revoked' })],
      '2026-09-20'
    );
    expect(state).toBe('needs-reapproval');
  });

  it('marks derivatives for reapproval when a fact goes stale', () => {
    const { state } = assessArtifact(
      artifact,
      [fact({ status: 'stale' })],
      '2026-09-20'
    );
    expect(state).toBe('needs-reapproval');
  });
});

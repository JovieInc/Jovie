import { describe, expect, it } from 'vitest';
import type { ProfileFact } from './verified-facts';
import {
  applyFactStates,
  approveDerivative,
  generateDerivative,
  lintSentenceAgainstFact,
  resolveFact,
  selectEligibleFacts,
} from './verified-facts';
import {
  TIM_SUBJECT_ENTITY_ID,
  timProfileFacts,
} from './verified-facts.tim.fixture';

const NOW = new Date('2026-09-26T00:00:00.000Z');

function fact(overrides: Partial<ProfileFact>): ProfileFact {
  return {
    id: 'f1',
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: 'Tim White',
    relation: 'founder',
    objectName: 'Jovie',
    phrase: 'is the founder of Jovie',
    claim: { label: 'founder of Jovie', value: 'founder' },
    evidence: [
      {
        sourceRecordId: 'src_1',
        sourceType: 'manual',
        visibility: 'public',
      },
    ],
    observedAt: '2026-09-01T00:00:00.000Z',
    verifiedAt: '2026-09-01T00:00:00.000Z',
    confidence: 'high',
    status: 'verified',
    publication: 'public',
    ...overrides,
  };
}

describe('resolveFact', () => {
  it('marks verified public facts with evidence as publication-eligible', () => {
    const resolved = resolveFact(fact({}), NOW);
    expect(resolved.status).toBe('verified');
    expect(resolved.publicationEligible).toBe(true);
  });

  it('treats expired evidence windows as stale', () => {
    const resolved = resolveFact(
      fact({ expiresAt: '2026-09-01T00:00:00.000Z' }),
      NOW
    );
    expect(resolved.status).toBe('stale');
    expect(resolved.publicationEligible).toBe(false);
  });

  it('separates approval from verification: approved wording on a candidate stays ineligible', () => {
    const resolved = resolveFact(
      fact({ status: 'candidate', approvedWording: 'is a legend' }),
      NOW
    );
    expect(resolved.publicationEligible).toBe(false);
  });

  it('requires explicit publication permission for private sources', () => {
    const resolved = resolveFact(fact({ publication: 'private' }), NOW);
    expect(resolved.publicationEligible).toBe(false);
  });
});

describe('selectEligibleFacts', () => {
  it('excludes wrong-person matches by subject entity id', () => {
    const other = fact({
      id: 'other_tim',
      subjectEntityId: 'ent_other_tim_white',
    });
    const selected = selectEligibleFacts([other, fact({})], {
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      now: NOW,
    });
    expect(selected.map(r => r.fact.id)).toEqual(['f1']);
  });

  it('dedupes overlapping sources instead of inflating aggregate counts', () => {
    const lower = fact({
      id: 'streams_low',
      claim: { label: 'all-time streams', value: 60_000_000, unit: 'streams' },
      phrase: 'has 60000000 streams',
      aggregateKey: 'streams',
      confidence: 'low',
      verifiedAt: '2026-08-01T00:00:00.000Z',
    });
    const higher = fact({
      id: 'streams_high',
      claim: { label: 'all-time streams', value: 70_000_000, unit: 'streams' },
      phrase: 'has 70000000 streams',
      aggregateKey: 'streams',
      confidence: 'high',
      verifiedAt: '2026-09-01T00:00:00.000Z',
    });
    const selected = selectEligibleFacts([lower, higher], {
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      now: NOW,
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.fact.id).toBe('streams_high');
  });
});

describe('generateDerivative', () => {
  it('produces a Tim bio with sentence-to-evidence traceability and omits unverified claims', () => {
    const bio = generateDerivative(timProfileFacts, {
      kind: 'bio',
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      audience: 'press',
      now: NOW,
    });
    expect(bio.sentences.length).toBeGreaterThanOrEqual(2);
    for (const sentence of bio.sentences) {
      expect(sentence.evidenceSourceRecordIds.length).toBeGreaterThan(0);
    }
    const text = bio.sentences.map(s => s.text).join(' ');
    expect(text).toContain('founder of Jovie');
    expect(text).not.toMatch(/70|Grammy|chart|exit|YC/i);
  });

  it('keeps exact data exact even when display is rounded', () => {
    const sentences = generateDerivative(
      [
        fact({
          phrase: 'cataloged 12345678 streams',
          claim: { label: 'streams', value: 12_345_678, unit: 'streams' },
        }),
      ],
      { kind: 'boilerplate', subjectEntityId: TIM_SUBJECT_ENTITY_ID, now: NOW }
    ).sentences;
    expect(sentences[0]?.text).toContain('12345678');
  });

  it('rejects embellishing paraphrases that inflate the claim', () => {
    const f = fact({
      claim: { label: 'streams', value: 70_000_000, unit: 'streams' },
    });
    expect(
      lintSentenceAgainstFact('Tim White has 70000000 streams.', f)
    ).toEqual([]);
    const violations = lintSentenceAgainstFact(
      'Tim White has 80000000 streams.',
      f
    );
    expect(violations.length).toBe(1);
  });
});

describe('revocation and audit trail', () => {
  it('withdraws affected sentences and marks the derivative for reapproval', () => {
    const facts = [
      fact({ id: 'a', phrase: 'is the founder of Jovie' }),
      fact({ id: 'b', phrase: 'releases music independently' }),
    ];
    const draft = generateDerivative(facts, {
      kind: 'boilerplate',
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      now: NOW,
    });
    const approved = approveDerivative(draft, '2026-09-20T00:00:00.000Z');

    const revokedFacts = facts.map(f =>
      f.id === 'b' ? { ...f, status: 'revoked' as const } : f
    );
    const { derivative, withdrawnFactIds } = applyFactStates(
      approved,
      revokedFacts,
      '2026-09-26T00:00:00.000Z'
    );

    expect(withdrawnFactIds).toEqual(['b']);
    expect(derivative.status).toBe('needs_reapproval');
    expect(derivative.sentences.map(s => s.factId)).toEqual(['a']);
    // Historical approved version retained in the audit trail.
    expect(derivative.versions.some(v => v.status === 'approved')).toBe(true);
    expect(derivative.versions).toHaveLength(3);
  });

  it('marks the whole derivative withdrawn when every fact is revoked', () => {
    const facts = [fact({ id: 'a' })];
    const draft = generateDerivative(facts, {
      kind: 'pitch',
      subjectEntityId: TIM_SUBJECT_ENTITY_ID,
      now: NOW,
    });
    const { derivative } = applyFactStates(
      draft,
      [{ ...facts[0]!, status: 'contradicted' }],
      NOW.toISOString()
    );
    expect(derivative.status).toBe('withdrawn');
    expect(derivative.sentences).toHaveLength(0);
  });
});

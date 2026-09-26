import { describe, expect, it } from 'vitest';
import {
  TIM_ARTIST_PROFILE_FACT,
  TIM_CATALOG_COUNT_FACT,
  TIM_FACTS_FIXTURE,
  TIM_FOUNDER_FACT,
  TIM_NSAW_CREDIT_FACT,
  TIM_PRIVATE_NOTE_FACT,
  TIM_SUBJECT_ENTITY_ID,
  UNVERIFIED_70M_STREAMS,
  WRONG_PERSON_GRAMMY,
} from './tim-facts.fixture';
import type { ProfileFact } from './verified-facts';
import {
  dedupeMetrics,
  generateBoilerplate,
  isPublicationEligible,
  revalidateBoilerplate,
  selectEligibleFacts,
} from './verified-facts';

const baseFact: ProfileFact = { ...TIM_FOUNDER_FACT, id: 'fact-base' };

describe('isPublicationEligible', () => {
  it('accepts a verified, public, confirmed fact with evidence', () => {
    expect(isPublicationEligible(baseFact)).toBe(true);
  });

  it.each([
    { subjectStatus: 'candidate' as const },
    { subjectStatus: 'rejected' as const },
    { status: 'candidate' as const },
    { status: 'contradicted' as const },
    { status: 'stale' as const },
    { status: 'revoked' as const },
    { publication: 'internal' as const },
    { publication: 'none' as const },
    { evidence: [] },
  ])('rejects %o', patch => {
    expect(isPublicationEligible({ ...baseFact, ...patch })).toBe(false);
  });
});

describe('selectEligibleFacts', () => {
  it('omits ineligible facts with reasons', () => {
    const { eligible, omitted } = selectEligibleFacts(TIM_FACTS_FIXTURE);
    const eligibleIds = eligible.map(f => f.id);
    for (const id of [
      TIM_FOUNDER_FACT.id,
      TIM_ARTIST_PROFILE_FACT.id,
      TIM_NSAW_CREDIT_FACT.id,
      TIM_CATALOG_COUNT_FACT.id,
    ]) {
      expect(eligibleIds).toContain(id);
    }
    const omittedIds = omitted.map(o => o.fact.id);
    for (const id of [
      TIM_PRIVATE_NOTE_FACT.id,
      UNVERIFIED_70M_STREAMS.id,
      WRONG_PERSON_GRAMMY.id,
    ]) {
      expect(omittedIds).toContain(id);
    }
    expect(
      omitted.find(o => o.fact.id === WRONG_PERSON_GRAMMY.id)?.reason
    ).toMatch(/not confirmed/);
    expect(
      omitted.find(o => o.fact.id === TIM_PRIVATE_NOTE_FACT.id)?.reason
    ).toMatch(/permission/);
  });
});

describe('dedupeMetrics', () => {
  it('never sums overlapping stream sources; keeps the best fact', () => {
    const a: ProfileFact = {
      ...UNVERIFIED_70M_STREAMS,
      id: 'metric-a',
      value: 40_000_000,
      status: 'verified',
      verifiedAt: '2026-09-01',
      confidence: 'medium',
    };
    const b: ProfileFact = {
      ...UNVERIFIED_70M_STREAMS,
      id: 'metric-b',
      value: 30_000_000,
      status: 'verified',
      verifiedAt: '2026-09-10',
      confidence: 'medium',
    };
    const metrics = dedupeMetrics([a, b]).filter(f => f.kind === 'metric');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].id).toBe('metric-b');
    expect(metrics[0].value).toBe(30_000_000);
  });
});

const bio = (id: string, audience?: 'press' | 'investor' | 'booking') =>
  generateBoilerplate({
    id,
    subjectEntityId: TIM_SUBJECT_ENTITY_ID,
    subjectName: 'Tim White',
    audience,
    facts: TIM_FACTS_FIXTURE,
    generatedAt: '2026-09-26T00:00:00Z',
  });

describe('generateBoilerplate', () => {
  it('produces a short bio with sentence-to-fact traceability', () => {
    const out = bio('bio-1');
    expect(out.status).toBe('draft');
    expect(out.sentences.length).toBeGreaterThanOrEqual(3);
    expect(out.text).toContain('founder of Jovie');
    expect(out.text).toContain('Never Say A Word');
    for (const s of out.sentences) expect(s.factIds.length).toBeGreaterThan(0);
    expect(out.text).not.toContain('70');
    expect(out.text).not.toContain('Grammy');
    expect(out.text).not.toContain('Private');
    expect(out.omittedFactIds).toContain(UNVERIFIED_70M_STREAMS.id);
    expect(out.omittedFactIds).toContain(TIM_PRIVATE_NOTE_FACT.id);
  });

  it('renders exact metric values without embellishment', () => {
    const s = bio('bio-2').sentences.find(x =>
      x.factIds.includes(TIM_CATALOG_COUNT_FACT.id)
    );
    expect(s?.text).toContain('18 singles');
    expect(s?.text).not.toMatch(/million/i);
  });

  it('scopes facts to the requested subject (wrong-person guard)', () => {
    const out = generateBoilerplate({
      id: 'bio-3',
      subjectEntityId: 'entity-someone-else',
      subjectName: 'Other Person',
      facts: TIM_FACTS_FIXTURE,
      generatedAt: '2026-09-26T00:00:00Z',
    });
    expect(out.sentences).toHaveLength(0);
    expect(out.text).toBe('');
  });

  it('selects audience-relevant facts without changing them', () => {
    const investor = bio('bio-4', 'investor');
    expect(
      investor.sentences.some(s => s.factIds.includes(TIM_NSAW_CREDIT_FACT.id))
    ).toBe(false);
    expect(investor.text).toContain('founder of Jovie');
  });
});

describe('revalidateBoilerplate', () => {
  it('marks derivatives needs_reapproval when a fact is revoked', () => {
    const out = bio('bio-5');
    const next = TIM_FACTS_FIXTURE.map(f =>
      f.id === TIM_FOUNDER_FACT.id ? { ...f, status: 'revoked' as const } : f
    );
    expect(revalidateBoilerplate(out, next).status).toBe('needs_reapproval');
    expect(out.status).toBe('draft');
  });
});

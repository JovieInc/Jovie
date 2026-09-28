import { describe, expect, it } from 'vitest';
import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';
import {
  generateProfileCopy,
  validateParaphrase,
} from '@/lib/verified-facts/generate';
import {
  aggregateMetric,
  applyFactChanges,
  findContradictions,
  isPublicationEligible,
  registerDerivative,
  resolveSubject,
  revokeFact,
  setPublicationPermission,
} from '@/lib/verified-facts/registry';
import {
  TIM_WHITE_ENTITY_ID,
  TIM_WHITE_FACTS,
  TIM_WHITE_SUBJECT,
  timWhiteBoilerplate,
} from '@/lib/verified-facts/tim-white';
import type {
  FactClaim,
  ProfileFact,
  SubjectEntity,
} from '@/lib/verified-facts/types';

const NOW = '2026-09-26';

function makeFact(o: Partial<ProfileFact> & { id: string }): ProfileFact {
  return {
    subjectEntityId: TIM_WHITE_ENTITY_ID,
    claim: { kind: 'role', predicate: 'founder-of', value: 'founder' },
    sources: [{ location: 't://s', refs: [], observedAt: NOW }],
    limitations: [],
    confidence: 0.9,
    status: 'verified',
    approval: { approved: true },
    permission: { scope: 'public', grantedAt: NOW },
    ...o,
  };
}

const metric = (id: string, value: number, window?: FactClaim['window']) =>
  makeFact({
    id,
    claim: {
      kind: 'metric',
      predicate: 'streams',
      value,
      unit: 'streams',
      window,
    },
  });

const GOSPEL_TIM: SubjectEntity = {
  entityId: 'person:tim-white-gospel',
  name: 'Tim White',
  aliases: [],
  identifiers: { spotifyArtistId: '59NJtiWq8nISIJjDtITQyt' },
};
const SUBJECTS = [TIM_WHITE_SUBJECT, GOSPEL_TIM];

describe('resolveSubject', () => {
  it('resolves canonical subject by identifier', () => {
    const r = resolveSubject(SUBJECTS, TIM_WHITE_SPOTIFY_ID);
    expect(r).toMatchObject({ status: 'resolved' });
    if (r.status === 'resolved')
      expect(r.entity.entityId).toBe(TIM_WHITE_ENTITY_ID);
  });

  it('returns ambiguous on a shared bare name', () => {
    const r = resolveSubject(SUBJECTS, 'Tim White');
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') expect(r.candidates).toHaveLength(2);
  });
});

describe('isPublicationEligible', () => {
  it('requires verification, approval, and live public permission together', () => {
    expect(isPublicationEligible(makeFact({ id: 'ok' }))).toBe(true);
    expect(
      isPublicationEligible(makeFact({ id: 'c', status: 'candidate' }))
    ).toBe(false);
    expect(
      isPublicationEligible(
        makeFact({ id: 'u', approval: { approved: false } })
      )
    ).toBe(false);
    expect(
      isPublicationEligible(
        makeFact({ id: 'p', permission: { scope: 'private' } })
      )
    ).toBe(false);
  });

  it('approved wording does not verify an unsupported claim', () => {
    const f = makeFact({
      id: 'x',
      status: 'candidate',
      approval: { approved: true, approvedWording: 'Won a Grammy.' },
    });
    expect(isPublicationEligible(f)).toBe(false);
  });

  it('excludes stale/revoked/contradicted and revoked permission', () => {
    for (const status of ['stale', 'revoked', 'contradicted'] as const) {
      expect(isPublicationEligible(makeFact({ id: status, status }))).toBe(
        false
      );
    }
    const f = revokeFact(makeFact({ id: 'was-public' }), `${NOW}T12:00:00Z`);
    expect(isPublicationEligible(f)).toBe(false);
  });

  it('private-source facts stay private until permitted', () => {
    const f = makeFact({
      id: 'priv-src',
      sources: [
        { location: 't://p', refs: [], observedAt: NOW, privateSource: true },
      ],
      permission: { scope: 'public' },
    });
    expect(isPublicationEligible(f)).toBe(false);
    expect(
      isPublicationEligible(setPublicationPermission(f, 'public', NOW))
    ).toBe(true);
  });
});

describe('aggregateMetric', () => {
  it('does not double-count overlapping sources', () => {
    const facts = [
      metric('s1', 40_000_000, { start: '2020-01', end: '2025-12' }),
      metric('s2', 30_000_000, { start: '2021-06', end: '2026-03' }),
    ];
    const agg = aggregateMetric(
      facts,
      TIM_WHITE_ENTITY_ID,
      'streams',
      'streams'
    );
    expect(agg.value).toBe(40_000_000);
  });

  it('sums disjoint windows, ignores unverified facts', () => {
    const facts = [
      metric('s1', 10_000_000, { start: '2020-01', end: '2021-12' }),
      metric('s2', 5_000_000, { start: '2023-01', end: '2024-12' }),
      {
        ...metric('s3', 999, { start: '2020-06', end: '2022-06' }),
        status: 'candidate' as const,
      },
    ];
    const agg = aggregateMetric(
      facts,
      TIM_WHITE_ENTITY_ID,
      'streams',
      'streams'
    );
    expect(agg.value).toBe(15_000_000);
  });
});

describe('findContradictions', () => {
  it('flags conflicting values on one predicate', () => {
    const idClaim = (value: string): FactClaim => ({
      kind: 'identifier',
      predicate: 'spotify-artist-id',
      value,
    });
    const facts = [
      makeFact({ id: 'a', claim: idClaim('X') }),
      makeFact({ id: 'b', claim: idClaim('Y') }),
    ];
    expect(findContradictions(facts)).toHaveLength(1);
  });
});

describe('validateParaphrase', () => {
  it('rejects numeric inflation', () => {
    const v = validateParaphrase(
      'Passed 120 million streams.',
      metric('m', 70_000_000)
    );
    expect(v.length).toBeGreaterThan(0);
  });

  it('rejects nomination-to-win upgrade', () => {
    const f = makeFact({
      id: 'g',
      claim: {
        kind: 'award',
        predicate: 'grammy',
        value: 'a Grammy Award',
        qualifier: 'nominated',
      },
    });
    expect(
      validateParaphrase('Grammy-winning artist.', f).length
    ).toBeGreaterThan(0);
    expect(
      validateParaphrase('Tim White was nominated for a Grammy Award.', f)
    ).toHaveLength(0);
  });

  it('rejects injected superlatives', () => {
    const v = validateParaphrase(
      'The sole founder of Jovie.',
      makeFact({ id: 'r' })
    );
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('generateProfileCopy', () => {
  it('traced boilerplate omits unverified claims', () => {
    const copy = timWhiteBoilerplate();
    expect(copy.text).toContain('founder of Jovie');
    for (const s of copy.sentences) expect(s.factIds.length).toBeGreaterThan(0);
    expect(copy.text).not.toContain('Cosmic Gate');
    expect(
      copy.omitted.some(
        o =>
          o.factId === 'fact:tim-cosmic-gate-collab' &&
          o.reason === 'unverified'
      )
    ).toBe(true);
  });

  it('all surfaces share the same eligible facts', () => {
    const sets = (['bio', 'pitch', 'boilerplate'] as const).map(surface =>
      generateProfileCopy({
        subject: TIM_WHITE_SUBJECT,
        facts: TIM_WHITE_FACTS,
        surface,
      }).sentences.flatMap(s => s.factIds)
    );
    for (const ids of sets) expect(new Set(ids)).toEqual(new Set(sets[0]));
  });

  it('never attributes a company fact to the artist', () => {
    const org: SubjectEntity = {
      entityId: 'org:jovie',
      name: 'Jovie',
      aliases: [],
      identifiers: {},
    };
    const acq = makeFact({
      id: 'acq',
      subjectEntityId: 'org:jovie',
      claim: {
        kind: 'metric',
        predicate: 'acquisition-value',
        value: 50_000_000,
        unit: 'usd',
      },
    });
    const artist = generateProfileCopy({
      subject: TIM_WHITE_SUBJECT,
      facts: [...TIM_WHITE_FACTS, acq],
      surface: 'bio',
    });
    expect(artist.text).not.toContain('50,000,000');
    expect(
      generateProfileCopy({ subject: org, facts: [acq], surface: 'bio' }).text
    ).toContain('50,000,000');
  });

  it('rounded display keeps exact value underneath', () => {
    const fact = makeFact({
      id: 'r',
      claim: {
        kind: 'metric',
        predicate: 'streams',
        value: 4_213_877,
        unit: 'streams',
        displayValue: '4.2 million',
      },
    });
    const copy = generateProfileCopy({
      subject: TIM_WHITE_SUBJECT,
      facts: [fact],
      surface: 'bio',
    });
    expect(copy.text).toContain('4.2 million');
    expect(fact.claim.value).toBe(4_213_877);
  });

  it('revoked fact marks derivative for reapproval', () => {
    const copy = timWhiteBoilerplate();
    const d = registerDerivative('d1', copy, `${NOW}T00:00:00Z`);
    const revoked = TIM_WHITE_FACTS.map(f =>
      f.id === 'fact:tim-founder-of-jovie'
        ? revokeFact(f, `${NOW}T12:00:00Z`)
        : f
    );
    const updated = applyFactChanges(d, revoked, `${NOW}T12:00:00Z`);
    expect(updated.status).toBe('needs-reapproval');
    expect(updated.history.some(e => e.event === 'fact-revoked')).toBe(true);
    expect(updated.copy).toEqual(copy); // historical copy retained for audit
  });
});

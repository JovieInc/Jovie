import { describe, expect, it } from 'vitest';
import {
  type CreatorFeatures,
  creatorFeatureTokens,
  MIN_POSITIVE_EXAMPLES,
  rankListCandidates,
} from './learner';
import type { PreferenceExample } from './model';

function creator(
  id: string,
  overrides: Partial<CreatorFeatures> = {}
): CreatorFeatures {
  return { id, ...overrides };
}

const CREATORS: CreatorFeatures[] = [
  creator('pick1', {
    genres: ['Indie Pop', 'bedroom pop'],
    spotifyFollowers: 25_000,
    location: 'Los Angeles, CA',
  }),
  creator('pick2', {
    genres: ['indie pop'],
    spotifyFollowers: 40_000,
    location: 'los angeles',
  }),
  creator('pass1', {
    genres: ['drill'],
    spotifyFollowers: 2_000_000,
    location: 'London',
  }),
  creator('cand-match', {
    genres: ['indie pop', 'dream pop'],
    spotifyFollowers: 60_000,
    location: 'Los Angeles',
  }),
  creator('cand-partial', { genres: ['indie pop'], location: 'Chicago' }),
  creator('cand-opposite', {
    genres: ['drill'],
    spotifyFollowers: 3_000_000,
    location: 'London',
  }),
  creator('cand-unknown', { genres: ['polka'] }),
];
const BY_ID = new Map(CREATORS.map(c => [c.id, c]));

const EXAMPLES: PreferenceExample[] = [
  { creatorId: 'pick1', label: 1, weight: 2 },
  { creatorId: 'pick2', label: 1, weight: 1 },
  { creatorId: 'pass1', label: -1, weight: 1 },
];

function rank(
  examples = EXAMPLES,
  excludeIds = new Set(['pick1', 'pick2', 'pass1'])
) {
  return rankListCandidates({
    examples,
    creatorsById: BY_ID,
    candidates: CREATORS,
    excludeIds,
    limit: 10,
  });
}

describe('ovie list learner', () => {
  it('tokenizes ingestion features and skips missing data', () => {
    expect(
      creatorFeatureTokens(
        creator('x', {
          genres: ['Indie Pop', 'indie  pop'],
          spotifyFollowers: 999,
          spotifyPopularity: 100,
          location: 'Los Angeles, CA',
          activeSinceYear: 2017,
          isVerified: true,
          isClaimed: false,
        })
      )
    ).toEqual([
      'genre:indie pop',
      'followers:under 1K',
      'popularity:80-100',
      'location:los angeles',
      'era:2015',
      'verified:yes',
      'claimed:no',
    ]);
    expect(creatorFeatureTokens(creator('empty'))).toEqual([]);
  });

  it('ranks the closest match first and drops opposite or unexplained candidates', () => {
    const ranked = rank();
    expect(ranked.map(r => r.creatorId)).toEqual([
      'cand-match',
      'cand-partial',
    ]);
  });

  it('explains every suggestion with the shared evidence', () => {
    const [top] = rank();
    expect(top?.reasons.length).toBeGreaterThan(0);
    expect(top?.reasons.map(r => r.text)).toContain(
      'Shares indie pop with 2 of 2 picks'
    );
    expect(top?.reasons.every(r => r.contribution > 0)).toBe(true);
  });

  it('stays silent until the list has enough positive examples', () => {
    expect(MIN_POSITIVE_EXAMPLES).toBe(2);
    expect(rank([{ creatorId: 'pick1', label: 1, weight: 1 }])).toEqual([]);
  });

  it('never re-suggests excluded creators', () => {
    const ranked = rank(
      EXAMPLES,
      new Set(['pick1', 'pick2', 'pass1', 'cand-match'])
    );
    expect(ranked.map(r => r.creatorId)).toEqual(['cand-partial']);
  });

  it('learns from new labels: a rejected genre stops ranking', () => {
    const before = rank().map(r => r.creatorId);
    expect(before).toContain('cand-partial');
    // Founder now passes on two Chicago indie-pop acts with no LA tie.
    const chicago1 = creator('chi1', {
      genres: ['indie pop'],
      location: 'Chicago',
    });
    const chicago2 = creator('chi2', {
      genres: ['indie pop'],
      location: 'Chicago',
    });
    const byId = new Map([...BY_ID, ['chi1', chicago1], ['chi2', chicago2]]);
    const ranked = rankListCandidates({
      examples: [
        ...EXAMPLES,
        { creatorId: 'chi1', label: -1, weight: 1 },
        { creatorId: 'chi2', label: -1, weight: 1 },
      ],
      creatorsById: byId,
      candidates: CREATORS,
      excludeIds: new Set(['pick1', 'pick2', 'pass1']),
      limit: 10,
    });
    expect(ranked.map(r => r.creatorId)).toEqual(['cand-match']);
  });

  it('is deterministic for ties', () => {
    expect(rank()).toEqual(rank());
  });
});

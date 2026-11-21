import { describe, expect, it } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import {
  assessArtistPickerMatch,
  formatArtistPickerDifferentiator,
  shouldProposeTopArtistMatch,
} from './artist-picker-match';

function artist(
  partial: Partial<SpotifyArtistResult> &
    Pick<SpotifyArtistResult, 'id' | 'name'>
): SpotifyArtistResult {
  return {
    url: `https://open.spotify.com/artist/${partial.id}`,
    popularity: partial.popularity ?? 50,
    followers: partial.followers,
    ...partial,
  };
}

describe('assessArtistPickerMatch', () => {
  it('proposes a strong unique exact match', () => {
    const results = [
      artist({ id: 'billie', name: 'Billie Eilish', followers: 90_000_000 }),
      artist({
        id: 'lookalike',
        name: "Billie Eilish O'Connell",
        followers: 4_200,
      }),
    ];
    const assessment = assessArtistPickerMatch({
      query: 'Billie Eilish',
      results,
    });
    expect(assessment.decision).toBe('propose');
    expect(assessment.proposal?.id).toBe('billie');
    expect(
      shouldProposeTopArtistMatch({ query: 'Billie Eilish', results })
    ).toBe(true);
  });

  it('forces disambiguation when a lookalike sits on top', () => {
    const results = [
      artist({
        id: 'lookalike',
        name: "Billie Eilish O'Connell",
        followers: 4_200,
      }),
      artist({ id: 'billie', name: 'Billie Eilish', followers: 90_000_000 }),
    ];
    const assessment = assessArtistPickerMatch({
      query: 'Billie Eilish',
      results,
    });
    expect(assessment.decision).toBe('disambiguate');
    expect(assessment.reason).toBe('lookalike_dominance');
    expect(assessment.proposal).toBeNull();
  });

  it('forces disambiguation on a weak name match', () => {
    const assessment = assessArtistPickerMatch({
      query: 'Taylor Swift',
      results: [
        artist({ id: 'other', name: 'Taylor Made Beats', followers: 12_000 }),
      ],
    });
    expect(assessment.decision).toBe('disambiguate');
    expect(assessment.reason).toBe('weak_name');
  });

  it('forces disambiguation when several close names compete', () => {
    const assessment = assessArtistPickerMatch({
      query: 'Chris',
      results: [
        artist({ id: 'a', name: 'Chris Brown', followers: 50_000_000 }),
        artist({ id: 'b', name: 'Chris Stapleton', followers: 10_000_000 }),
        artist({ id: 'c', name: 'Chris Cornell', followers: 5_000_000 }),
      ],
    });
    expect(assessment.decision).toBe('disambiguate');
    expect(assessment.reason).toBe('competing_matches');
  });

  it('does not re-propose a rejected top id', () => {
    const results = [
      artist({ id: 'wrong', name: 'Billie Eilish', followers: 90_000_000 }),
    ];
    const assessment = assessArtistPickerMatch({
      query: 'Billie Eilish',
      results,
      rejectedIds: ['wrong'],
    });
    expect(assessment.decision).toBe('disambiguate');
    expect(assessment.reason).toBe('rejected_top');
  });

  it('returns empty when there is no query or results', () => {
    expect(assessArtistPickerMatch({ query: '', results: [] }).decision).toBe(
      'empty'
    );
    expect(
      assessArtistPickerMatch({
        query: 'x',
        results: [],
      }).decision
    ).toBe('empty');
  });
});

describe('formatArtistPickerDifferentiator', () => {
  it('marks exact name matches', () => {
    expect(
      formatArtistPickerDifferentiator(
        artist({ id: '1', name: 'Billie Eilish', followers: 1_200_000 }),
        'Billie Eilish'
      )
    ).toMatch(/Exact name/);
  });

  it('falls back to followers for near matches', () => {
    expect(
      formatArtistPickerDifferentiator(
        artist({
          id: '2',
          name: "Billie Eilish O'Connell",
          followers: 4_200,
        }),
        'Billie Eilish'
      )
    ).toMatch(/followers/);
  });
});

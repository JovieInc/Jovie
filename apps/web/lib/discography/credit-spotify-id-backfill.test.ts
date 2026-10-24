import { describe, expect, it } from 'vitest';
import {
  type CreditConflictRow,
  planCreditSpotifyIdRepairs,
  summarizeRepairs,
} from './credit-spotify-id-backfill';

const base: CreditConflictRow = {
  releaseArtistId: 'ra-1',
  releaseId: 'rel-1',
  artistId: 'artist-stale',
  artistName: 'Dimitri Vegas',
  storedSpotifyId: 'stale',
  providerSpotifyId: 'real',
  ownerArtistId: null,
  ownerAlreadyCredited: false,
  artistIsUnclaimedAutoCreated: true,
};

describe('planCreditSpotifyIdRepairs', () => {
  it('repoints the credit when another artist row owns the provider id', () => {
    expect(
      planCreditSpotifyIdRepairs([{ ...base, ownerArtistId: 'artist-real' }])
    ).toEqual([
      {
        kind: 'repoint_credit',
        releaseArtistId: 'ra-1',
        fromArtistId: 'artist-stale',
        toArtistId: 'artist-real',
      },
    ]);
  });

  it('sets the id on an unclaimed auto-created artist', () => {
    expect(planCreditSpotifyIdRepairs([base])).toEqual([
      {
        kind: 'set_artist_spotify_id',
        artistId: 'artist-stale',
        fromSpotifyId: 'stale',
        toSpotifyId: 'real',
      },
    ]);
  });

  it('never rewrites a claimed or manually created artist', () => {
    const plan = planCreditSpotifyIdRepairs([
      { ...base, artistIsUnclaimedAutoCreated: false },
    ]);
    expect(summarizeRepairs(plan)).toMatchObject({
      'skip:artist_claimed_or_manual': 1,
      set_artist_spotify_id: 0,
    });
  });

  it('skips ambiguous targets and is a no-op once repaired (idempotent)', () => {
    const plan = planCreditSpotifyIdRepairs([
      base,
      { ...base, releaseArtistId: 'ra-2', artistId: 'artist-other' },
      { ...base, releaseArtistId: 'ra-3', storedSpotifyId: 'real' },
    ]);
    expect(summarizeRepairs(plan)).toMatchObject({
      set_artist_spotify_id: 1,
      'skip:ambiguous_multiple_targets': 1,
    });
    expect(
      planCreditSpotifyIdRepairs([{ ...base, storedSpotifyId: 'real' }])
    ).toEqual([]);
  });
});

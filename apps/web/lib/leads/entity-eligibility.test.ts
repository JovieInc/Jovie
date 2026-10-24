import { describe, expect, it } from 'vitest';
import { possibleNonArtist } from './entity-eligibility';

const lead = (handle: string, displayName: string | null = null, bio = '') => ({
  handle,
  displayName,
  bio,
});

describe('possibleNonArtist', () => {
  it.each([
    ['spotifyplaylistcurator', 'curator'],
    ['playlistsubs', 'curator'],
    ['latinmusiccurator', 'curator'],
    ['amplitudedistribution', 'label'],
    ['screamrecords', 'label'],
    ['bonedeepenterprises', 'label'],
    ['punjabimediahub', 'media'],
    ['mojomusicandmedia', 'media'],
  ])('flags the handle %s as %s', (handle, kind) => {
    expect(possibleNonArtist(lead(handle))).toBe(kind);
  });

  it('flags business words in the name or bio', () => {
    expect(
      possibleNonArtist(
        lead('supersonic', 'SuperSonic', 'Independent record label, concerts')
      )
    ).toBe('label');
    expect(
      possibleNonArtist(lead('x', 'Best Spotify Playlist Pitch Submission'))
    ).toBe('curator');
  });

  it('leaves real artists unflagged', () => {
    for (const handle of [
      'odesza',
      'megaran',
      'tomrivermusic',
      'carlcoxofficial',
      'phenomenal_handclap',
      'comedianjoe',
    ])
      expect(possibleNonArtist(lead(handle))).toBeNull();
    // A DJ who founded a label still reads as an artist.
    expect(
      possibleNonArtist(
        lead(
          'djdannic',
          'Dannic',
          'Progressive grooves, founder of @fonkrecordings'
        )
      )
    ).toBeNull();
    expect(
      possibleNonArtist(lead('megaran', 'Mega Ran', 'Out on social media now'))
    ).toBeNull();
  });
});

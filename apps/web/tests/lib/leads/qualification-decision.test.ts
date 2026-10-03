import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideLeadQualification } from '@/lib/leads/qualification-decision';

const namedCreator = {
  displayName: 'Ada',
  links: [{ url: 'https://instagram.com/ada' }],
  hasSpotifyArtistUrl: false,
  spotifyLinkCount: 0,
};

describe('decideLeadQualification', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the Spotify-only rejection when the generic flag is off', () => {
    vi.stubEnv('FEATURE_LEAD_QUALIFY_GENERIC', '');

    expect(decideLeadQualification(namedCreator)).toEqual({
      status: 'disqualified',
      disqualificationReason: 'no_spotify',
    });
    expect(
      decideLeadQualification({
        ...namedCreator,
        links: [{ url: 'https://open.spotify.com/album/abc' }],
        spotifyLinkCount: 1,
      })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'spotify_artist_required',
    });
    expect(
      decideLeadQualification({
        ...namedCreator,
        hasSpotifyArtistUrl: true,
        spotifyLinkCount: 1,
      })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'commercial_fit_review_needed',
    });
  });

  it('qualifies a named creator with a non-Spotify link when the flag is on', () => {
    vi.stubEnv('FEATURE_LEAD_QUALIFY_GENERIC', 'true');

    expect(decideLeadQualification(namedCreator)).toEqual({
      status: 'qualified',
      disqualificationReason: null,
    });
  });

  it('rejects a blank name or a blank link when the flag is on', () => {
    vi.stubEnv('FEATURE_LEAD_QUALIFY_GENERIC', 'true');

    expect(
      decideLeadQualification({ ...namedCreator, displayName: '  ' })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
    expect(
      decideLeadQualification({
        ...namedCreator,
        links: [{ url: '  ' }],
      })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
    expect(decideLeadQualification({ ...namedCreator, links: [] })).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
  });
});

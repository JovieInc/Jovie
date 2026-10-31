import { describe, expect, it } from 'vitest';
import {
  ARTIST_IDENTITY_CERTIFY_THRESHOLD,
  type ArtistIdentityMatchEvidence,
  isEvidencedMatch,
  scoreArtistIdentity,
  summarizeArtistIdentity,
} from './artist-identity-confidence';

const SPOTIFY_ID = '4c9apHO3XHsvO1KyuwH0Rw';

function match(
  overrides: Partial<ArtistIdentityMatchEvidence> = {}
): ArtistIdentityMatchEvidence {
  return {
    providerId: 'apple_music',
    externalArtistId: '123',
    status: 'auto_confirmed',
    matchSource: 'isrc_discovery',
    confidenceScore: 0.91,
    matchingIsrcCount: 8,
    ...overrides,
  };
}

describe('scoreArtistIdentity', () => {
  it('does not certify a picked artist with no corroboration', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('needs_confirmation');
    expect(result.score).toBeLessThan(ARTIST_IDENTITY_CERTIFY_THRESHOLD);
    expect(result.reasons).toEqual(['bound_provider_identity']);
  });

  it('certifies a picked artist corroborated by ISRC evidence', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [match()],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('certified');
    expect(result.reasons).toContain('isrc_corroborated');
  });

  it('never lets an evidence-free vendor match certify (legacy MusicFetch rows)', () => {
    const vendorRows = ['spotify', 'deezer', 'tidal', 'beatport'].map(
      providerId =>
        match({
          providerId,
          externalArtistId: providerId === 'spotify' ? SPOTIFY_ID : 'x',
          matchSource: 'musicfetch',
          confidenceScore: null,
          matchingIsrcCount: 0,
        })
    );
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: vendorRows,
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('needs_confirmation');
    expect(result.unverifiedVendorMatches).toBe(4);
    expect(result.reasons).toContain('unverified_vendor_match');
    expect(result.reasons).not.toContain('isrc_corroborated');
  });

  it('flags a contradiction between the bound artist and an accepted match', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [
        match({
          providerId: 'spotify',
          externalArtistId: '4Uwpa6zW3zzCSQvooQNksm',
        }),
      ],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('conflict');
    expect(result.score).toBe(0);
  });

  it('ignores rejected and suggested matches for contradiction and evidence', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [
        match({
          providerId: 'spotify',
          externalArtistId: 'other',
          status: 'rejected',
        }),
        match({ status: 'suggested' }),
      ],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('needs_confirmation');
  });

  it('drops below the bar on a same-name collision', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [match()],
      sameNameCollisions: 1,
    });
    expect(result.decision).toBe('needs_confirmation');
    expect(result.reasons).toContain('same_name_collision');
  });

  it('does not certify a bound artist the owner explicitly rejected', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [
        match(),
        match({
          providerId: 'spotify',
          externalArtistId: SPOTIFY_ID,
          status: 'rejected',
        }),
      ],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('conflict');
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('owner_rejected_bound_identity');
  });

  it('certifies once the owner confirms, even with a same-name collision', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [
        match({
          providerId: 'spotify',
          externalArtistId: SPOTIFY_ID,
          status: 'confirmed',
          confidenceScore: null,
          matchingIsrcCount: 0,
        }),
      ],
      sameNameCollisions: 2,
    });
    expect(result.decision).toBe('certified');
    expect(result.reasons).toContain('owner_confirmed');
    expect(result.unverifiedVendorMatches).toBe(0);
  });

  it.each([
    { providerId: 'spotify', externalArtistId: null },
    { providerId: 'apple_music', externalArtistId: null },
    { providerId: 'apple_music', externalArtistId: '123' },
  ])(
    'does not trust unrelated confirmed links: $providerId/$externalArtistId',
    row => {
      const result = scoreArtistIdentity({
        boundIds: { spotify: SPOTIFY_ID },
        matches: [
          match({
            ...row,
            status: 'confirmed',
            matchSource: 'manual',
            confidenceScore: null,
            matchingIsrcCount: 0,
          }),
        ],
        sameNameCollisions: 1,
      });
      expect(result.decision).toBe('needs_confirmation');
      expect(result.score).toBe(0.3);
      expect(result.reasons).not.toContain('owner_confirmed');
      expect(result.reasons).toContain('same_name_collision');
    }
  );

  it('reports unbound when there is no provider identity at all', () => {
    const result = scoreArtistIdentity({
      boundIds: { spotify: null, apple_music: '' },
      matches: [],
      sameNameCollisions: 0,
    });
    expect(result.decision).toBe('unbound');
  });

  it('requires both confidence and ISRC count for evidence', () => {
    expect(isEvidencedMatch(match({ matchingIsrcCount: 2 }))).toBe(false);
    expect(isEvidencedMatch(match({ confidenceScore: 0.79 }))).toBe(false);
    expect(isEvidencedMatch(match())).toBe(true);
  });
});

describe('summarizeArtistIdentity', () => {
  it('reports null rates on an empty denominator, not zero', () => {
    expect(summarizeArtistIdentity([]).certifiedRate).toBeNull();
  });

  it('excludes unbound profiles from the certified rate', () => {
    const certified = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [match()],
      sameNameCollisions: 0,
    });
    const pending = scoreArtistIdentity({
      boundIds: { spotify: SPOTIFY_ID },
      matches: [],
      sameNameCollisions: 0,
    });
    const unbound = scoreArtistIdentity({
      boundIds: {},
      matches: [],
      sameNameCollisions: 0,
    });
    const summary = summarizeArtistIdentity([certified, pending, unbound]);
    expect(summary.profiles).toBe(3);
    expect(summary.certifiedRate).toBe(0.5);
    expect(summary.byDecision.unbound).toBe(1);
  });
});

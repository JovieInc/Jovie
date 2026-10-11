import { describe, expect, it } from 'vitest';
import {
  ARTIST_IDENTITY_CONTRACT,
  admitArtistIdentity,
} from './artist-identity';
import { requireCanonical, SemanticContractError } from './semantic-contract';

const PROVENANCE = {
  producer: 'test-producer@1',
  source: 'spotify_release_credit',
  confidence: 'imported' as const,
};

const SPOTIFY_ID = '3TVXtAsWU1IfumKqIcMftp';
const MUSICBRAINZ_ID = 'b95ce3ff-3d05-4e87-9e01-c97b66cf13ed';

const codes = (raw: unknown) =>
  admitArtistIdentity(raw, PROVENANCE).rejections.map(r => r.code);

describe('ARTIST_IDENTITY_CONTRACT (JOV-6543 deliberate-red fixtures)', () => {
  it('accepts a provider-backed identity and returns the canonical value', () => {
    const decision = admitArtistIdentity(
      { name: ' Fedde Le Grand ', spotifyId: SPOTIFY_ID },
      PROVENANCE
    );
    expect(decision.status).toBe('accepted');
    expect(decision.canonical).toEqual({
      name: 'Fedde Le Grand',
      spotifyId: SPOTIFY_ID,
    });
    expect(decision.field).toBe('artists.provider_identity');
    expect(decision.contractVersion).toBe(1);
    expect(decision.provenance.producer).toBe('test-producer@1');
  });

  it('admits same-name identities with distinct provider IDs independently', () => {
    // JOV-6543: identity is provider namespace + ID, never name. Two
    // different "Alex Lee" artists stay distinct; merge/collision logic is a
    // producer concern downstream of admission.
    const one = admitArtistIdentity(
      { name: 'Alex Lee', spotifyId: '3TVXtAsWU1IfumKqIcMftp' },
      PROVENANCE
    );
    const two = admitArtistIdentity(
      { name: 'Alex Lee', spotifyId: '1l7ZsJRRS8wlW3WfJfPfLG' },
      PROVENANCE
    );
    expect(one.status).toBe('accepted');
    expect(two.status).toBe('accepted');
    expect(one.canonical?.spotifyId).not.toBe(two.canonical?.spotifyId);
  });

  it('admits a name-only legacy/manual credit identity', () => {
    const decision = admitArtistIdentity({ name: 'Alex Lee' }, PROVENANCE);
    expect(decision.status).toBe('accepted');
    expect(decision.canonical?.name).toBe('Alex Lee');
  });

  it('admits legitimate international and alias names', () => {
    for (const name of [
      'Beyoncé',
      'Björk',
      '東京事変',
      "Sinéad O'Connor",
      'AC/DC',
    ]) {
      expect(admitArtistIdentity({ name }, PROVENANCE).status).toBe('accepted');
    }
  });

  it('quarantines names carrying serialized collections or URLs', () => {
    expect(codes({ name: '["a","b"]' })).toContain('serialized_collection');
    expect(codes({ name: '{"name":"x"}' })).toContain('serialized_collection');
    expect(codes({ name: 'https://spotify.com/artist/x' })).toContain(
      'url_in_name'
    );
    expect(codes({ name: 'www.example.com' })).toContain('url_in_name');
  });

  it('quarantines empty and non-string names', () => {
    for (const name of ['', '   ', null, undefined, 42, ['a', 'b']]) {
      expect(admitArtistIdentity({ name }, PROVENANCE).status).toBe(
        'quarantined'
      );
    }
    expect(codes({ name: '' })).toContain('empty_name');
    expect(codes({ name: 42 })).toContain('name_not_a_string');
  });

  it('quarantines implausible provider IDs instead of inventing identity links', () => {
    // Wrong-namespace or malformed IDs (e.g. a URL, a name, a truncated ID)
    // are the JOV-6542 defect class: they must never become a canonical
    // identity binding.
    for (const spotifyId of [
      'not-a-spotify-id',
      'https://open.spotify.com/artist/x',
      'Fedde Le Grand',
      SPOTIFY_ID.slice(0, 21),
      `${SPOTIFY_ID} extra`,
    ]) {
      expect(
        admitArtistIdentity({ name: 'X', spotifyId }, PROVENANCE).status
      ).toBe('quarantined');
      expect(codes({ name: 'X', spotifyId })).toContain(
        'implausible_provider_id'
      );
    }
  });

  it('quarantines non-string provider IDs', () => {
    expect(codes({ name: 'X', spotifyId: 123 })).toContain(
      'provider_id_not_a_string'
    );
    expect(codes({ name: 'X', deezerId: ['1'] })).toContain(
      'provider_id_not_a_string'
    );
  });

  it('validates each provider namespace against its own format', () => {
    expect(
      admitArtistIdentity(
        { name: 'X', musicbrainzId: MUSICBRAINZ_ID },
        PROVENANCE
      ).status
    ).toBe('accepted');
    expect(codes({ name: 'X', musicbrainzId: 'not-a-uuid' })).toContain(
      'implausible_provider_id'
    );
    // Apple Music / Deezer numeric-string IDs are plausible; junk is not.
    expect(
      admitArtistIdentity({ name: 'X', appleMusicId: '123456' }, PROVENANCE)
        .status
    ).toBe('accepted');
    expect(
      codes({ name: 'X', appleMusicId: 'https://music.apple.com/x' })
    ).toContain('implausible_provider_id');
  });

  it('quarantines non-object observations', () => {
    for (const raw of [null, undefined, 'Artist', [SPOTIFY_ID], 42]) {
      expect(admitArtistIdentity(raw, PROVENANCE).status).toBe('quarantined');
      expect(codes(raw)).toContain('not_an_object');
    }
  });

  it('records unknown provenance distinctly when the producer cannot identify itself', () => {
    const decision = admitArtistIdentity(
      { name: 'X' },
      { producer: 'unknown', confidence: 'unknown' }
    );
    expect(decision.status).toBe('accepted');
    expect(decision.provenance.confidence).toBe('unknown');
  });

  it('requireCanonical throws SemanticContractError carrying the decision', () => {
    expect(() =>
      requireCanonical(
        ARTIST_IDENTITY_CONTRACT,
        { name: 'X', spotifyId: 'bogus' },
        PROVENANCE
      )
    ).toThrow(SemanticContractError);
  });
});

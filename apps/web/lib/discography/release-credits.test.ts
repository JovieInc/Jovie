import { describe, expect, it } from 'vitest';
import { parseMainArtists } from './artist-parser';
import {
  type CanonicalReleaseCredit,
  collectOrderedPrimaryNames,
  materializeReleaseCreditPayload,
  parseProviderAlbumArtists,
  reconcilePrimaryArtists,
  resolveSmartLinkArtistByline,
  selectPrimaryArtistCredits,
  serializePrimaryArtists,
  WHEELS_UP_MULTI_PRIMARY_FIXTURE,
} from './release-credits';

const wheelsUpSourceCredits: CanonicalReleaseCredit[] = parseMainArtists(
  WHEELS_UP_MULTI_PRIMARY_FIXTURE.sourceArtists.map(artist => ({
    id: artist.id,
    name: artist.name,
  }))
).map(credit => ({
  artistId: `artist:${credit.spotifyId}`,
  spotifyId: credit.spotifyId,
  name: credit.name,
  handle: credit.name === 'Tim White' ? 'timwhite' : null,
  role: credit.role,
  position: credit.position,
  isPrimary: credit.isPrimary,
}));

describe('release credit integrity', () => {
  it('keeps both Wheels Up primaries through normalize + serialize', () => {
    const payload = materializeReleaseCreditPayload({
      storedCredits: wheelsUpSourceCredits,
    });

    expect(payload.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
      'LYNX',
    ]);
    expect(payload.primaryArtists.every(credit => credit.isPrimary)).toBe(true);
    expect(payload.mismatch).toBeNull();

    const cached = JSON.parse(
      JSON.stringify(serializePrimaryArtists(payload.primaryArtists))
    ) as CanonicalReleaseCredit[];
    expect(cached.map(credit => credit.name)).toEqual(['Tim White', 'LYNX']);
  });

  it('does not drop a co-primary when only the first credit is flagged isPrimary', () => {
    const stored = wheelsUpSourceCredits.map((credit, index) => ({
      ...credit,
      isPrimary: index === 0,
    }));

    expect(
      selectPrimaryArtistCredits(stored).map(credit => credit.name)
    ).toEqual(['Tim White', 'LYNX']);
  });

  it('does not use profile ownership as the public byline when credits exist', () => {
    const byline = resolveSmartLinkArtistByline({
      primaryArtists: [
        { name: 'Tim White', handle: 'timwhite' },
        { name: 'LYNX', handle: null },
      ],
      ownerName: 'Tim White',
      ownerHandle: 'timwhite',
    });

    expect(byline.text).toBe('Tim White and LYNX');
    expect(byline.entries.map(entry => entry.name)).toEqual([
      'Tim White',
      'LYNX',
    ]);
  });

  it('leaves single-artist releases unchanged', () => {
    const payload = materializeReleaseCreditPayload({
      storedCredits: [
        {
          artistId: 'artist-tim',
          spotifyId: 'spotify-tim-white',
          name: 'Tim White',
          handle: 'timwhite',
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
      ],
    });

    expect(payload.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
    ]);
    expect(
      resolveSmartLinkArtistByline({
        primaryArtists: payload.primaryArtists,
        ownerName: 'Tim White',
        ownerHandle: 'timwhite',
      }).text
    ).toBe('Tim White');
  });

  it('does not promote featured-only credits into the primary set', () => {
    const payload = materializeReleaseCreditPayload({
      storedCredits: [
        {
          artistId: 'artist-tim',
          spotifyId: 'spotify-tim-white',
          name: 'Tim White',
          handle: 'timwhite',
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
        {
          artistId: 'artist-guest',
          spotifyId: 'spotify-guest',
          name: 'Guest Vocal',
          handle: null,
          role: 'featured_artist',
          position: 1,
          isPrimary: false,
        },
      ],
    });

    expect(payload.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
    ]);
  });

  it('preserves the same primary set across cache revalidation', () => {
    const first = materializeReleaseCreditPayload({
      storedCredits: wheelsUpSourceCredits,
      providerArtists: parseProviderAlbumArtists({
        spotifyArtists: WHEELS_UP_MULTI_PRIMARY_FIXTURE.sourceArtists,
      }),
    });
    const revalidated = materializeReleaseCreditPayload({
      storedCredits: JSON.parse(
        JSON.stringify(first.primaryArtists)
      ) as CanonicalReleaseCredit[],
      providerArtists: parseProviderAlbumArtists({
        spotifyArtists: WHEELS_UP_MULTI_PRIMARY_FIXTURE.sourceArtists,
      }),
    });

    expect(revalidated.primaryArtists.map(credit => credit.name)).toEqual(
      first.primaryArtists.map(credit => credit.name)
    );
    expect(revalidated.mismatch).toBeNull();
  });

  it('unions a missing provider primary and emits an observable mismatch', () => {
    const storedOnlyOwner = wheelsUpSourceCredits.filter(
      credit => credit.name === 'Tim White'
    );
    const reconciled = reconcilePrimaryArtists({
      storedCredits: storedOnlyOwner,
      providerArtists: parseProviderAlbumArtists({
        spotifyArtists: WHEELS_UP_MULTI_PRIMARY_FIXTURE.sourceArtists,
      }),
    });

    expect(reconciled.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
      'LYNX',
    ]);
    expect(reconciled.mismatch).toMatchObject({
      provider: 'spotify',
      addedNames: ['LYNX'],
      storedNames: ['Tim White'],
      providerNames: ['Tim White', 'LYNX'],
    });
  });

  it('does not promote a featured credit even when a provider lists that artist', () => {
    const reconciled = reconcilePrimaryArtists({
      storedCredits: [
        {
          artistId: 'artist-tim',
          spotifyId: 'spotify-tim-white',
          name: 'Tim White',
          handle: 'timwhite',
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
        {
          artistId: 'artist-lynx',
          spotifyId: 'spotify-lynx',
          name: 'LYNX',
          handle: null,
          role: 'featured_artist',
          position: 1,
          isPrimary: false,
        },
      ],
      providerArtists: parseProviderAlbumArtists({
        spotifyArtists: WHEELS_UP_MULTI_PRIMARY_FIXTURE.sourceArtists,
      }),
    });

    expect(reconciled.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
    ]);
    expect(reconciled.mismatch?.skippedFeaturedNames).toEqual(['LYNX']);
  });

  it('dedupes dashboard artist names by canonical artist id, not similar names', () => {
    expect(
      collectOrderedPrimaryNames([
        { artistId: 'tim', name: 'Tim White', role: 'main_artist' },
        { artistId: 'lynx', name: 'LYNX', role: 'main_artist' },
        { artistId: 'tim', name: 'Timothy White', role: 'main_artist' },
        { artistId: 'guest', name: 'Guest Vocal', role: 'featured_artist' },
      ])
    ).toEqual(['Tim White', 'LYNX']);
  });
});

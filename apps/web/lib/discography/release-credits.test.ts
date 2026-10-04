import { describe, expect, it } from 'vitest';
import { NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE } from '@/lib/profile/opaque-internal-profile-handle';
import { parseMainArtists } from './artist-parser';
import {
  type CanonicalReleaseCredit,
  collectOrderedPrimaryNames,
  creditProviderMismatchWarningKey,
  materializeContributorCreditPayload,
  materializeReleaseCreditPayload,
  parseProviderAlbumArtists,
  reconcilePrimaryArtists,
  resetCreditProviderMismatchWarnings,
  resolveSmartLinkArtistByline,
  selectPrimaryArtistCredits,
  serializePrimaryArtists,
  shouldReportCreditProviderMismatch,
  TAKE_ME_OVER_ROLE_COMPLETE_FIXTURE,
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

  it('rewrites Never Say a Word opaque credit handle to canonical /tim', () => {
    const fixture = NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE;
    const byline = resolveSmartLinkArtistByline({
      primaryArtists: [
        { name: fixture.artistName, handle: fixture.opaqueHandle },
      ],
      ownerName: fixture.ownerName,
      ownerHandle: fixture.ownerHandle,
    });

    expect(byline.text).toBe(fixture.artistName);
    expect(byline.entries).toEqual([
      { name: fixture.artistName, handle: fixture.ownerHandle },
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

  it('serializes the complete Take Me Over contributor graph losslessly', () => {
    const fixture = TAKE_ME_OVER_ROLE_COMPLETE_FIXTURE;
    const credits: CanonicalReleaseCredit[] = fixture.expected.map(
      (credit, position) => ({
        artistId: `artist-${position}`,
        spotifyId: credit.name === 'Austin Leeds' ? 'spotify-austin' : null,
        appleMusicId: credit.name === 'Erica Gibson' ? 'apple-erica' : null,
        name: credit.name,
        handle: credit.name === 'Tim White' ? 'timwhite' : null,
        role: credit.role,
        position,
        isPrimary: credit.role === 'main_artist',
        sourceType: 'ingested',
        metadata: {
          apple_music: {
            sourceEntityId: 'apple-track-take-me-over-remix',
          },
        },
      })
    );

    const cached = JSON.parse(
      JSON.stringify(
        materializeContributorCreditPayload({ storedCredits: credits })
      )
    ) as ReturnType<typeof materializeContributorCreditPayload>;

    expect(cached.credits.map(({ name, role }) => ({ name, role }))).toEqual(
      fixture.expected
    );
    expect(cached.primaryArtists.map(credit => credit.name)).toEqual([
      'Tim White',
    ]);
    expect(cached.credits[1]).toMatchObject({
      appleMusicId: 'apple-erica',
      role: 'featured_artist',
      metadata: {
        apple_music: {
          sourceEntityId: 'apple-track-take-me-over-remix',
        },
      },
    });
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

  it('repairs stored credits that split Tones And I into Tones and I', () => {
    const providerArtists = parseProviderAlbumArtists({
      spotifyArtists: [
        { id: 'david-guetta', name: 'David Guetta' },
        { id: 'tones-and-i', name: 'Tones And I' },
        { id: 'nicky-romero', name: 'Nicky Romero' },
      ],
    });
    const stored: CanonicalReleaseCredit[] = [
      'David Guetta',
      'Tones',
      'I',
      'Nicky Romero',
    ].map((name, position) => ({
      artistId: `artist-${position}`,
      spotifyId: name === 'Tones' ? 'tones-and-i' : null,
      name,
      handle: null,
      role: 'main_artist' as const,
      position,
      isPrimary: true,
    }));

    const reconciled = reconcilePrimaryArtists({
      storedCredits: stored,
      providerArtists,
    });

    expect(reconciled.primaryArtists.map(credit => credit.name)).toEqual([
      'David Guetta',
      'Tones And I',
      'Nicky Romero',
    ]);
    expect(reconciled.mismatch).toBeNull();
    expect(
      reconciled.primaryArtists.find(credit => credit.name === 'Tones And I')
    ).toMatchObject({ spotifyId: 'tones-and-i' });
  });

  it('does not duplicate or flag a primary whose name differs only by case', () => {
    const reconciled = reconcilePrimaryArtists({
      storedCredits: [
        {
          artistId: 'artist-tones',
          name: 'Tones and I',
          handle: null,
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
      ],
      providerArtists: [
        { provider: 'spotify', id: 'tones-and-i', name: 'Tones And I' },
      ],
    });

    expect(reconciled.primaryArtists.map(credit => credit.name)).toEqual([
      'Tones and I',
    ]);
    expect(reconciled.mismatch).toBeNull();
  });

  it('does not hide a provider id conflict behind a case-only name match', () => {
    const reconciled = reconcilePrimaryArtists({
      storedCredits: [
        {
          artistId: 'artist-tones',
          spotifyId: 'different-spotify-artist',
          name: 'Tones and I',
          handle: null,
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
      ],
      providerArtists: [
        { provider: 'spotify', id: 'tones-and-i', name: 'Tones And I' },
      ],
    });

    expect(reconciled.primaryArtists).toHaveLength(2);
    expect(reconciled.mismatch).toMatchObject({
      addedNames: ['Tones And I'],
    });
  });

  it('does not treat unrelated neighbors as a split provider artist', () => {
    const reconciled = reconcilePrimaryArtists({
      storedCredits: [
        {
          artistId: 'artist-a',
          name: 'Bob',
          handle: null,
          role: 'main_artist',
          position: 0,
          isPrimary: true,
        },
        {
          artistId: 'artist-b',
          name: 'Dylan',
          handle: null,
          role: 'main_artist',
          position: 1,
          isPrimary: true,
        },
      ],
      providerArtists: [
        { provider: 'spotify', id: 'bob-dylan', name: 'Bob Dylan' },
      ],
    });

    expect(reconciled.primaryArtists.map(credit => credit.name)).toEqual([
      'Bob',
      'Dylan',
      'Bob Dylan',
    ]);
    expect(reconciled.mismatch?.addedNames).toEqual(['Bob Dylan']);
  });

  it('reports each credit provider mismatch once per warm instance', () => {
    resetCreditProviderMismatchWarnings();
    const key = creditProviderMismatchWarningKey({
      entityType: 'release',
      entityId: 'release-1',
      mismatch: {
        provider: 'spotify',
        storedNames: ['Tim White'],
        providerNames: ['Tim White', 'LYNX'],
        addedNames: ['LYNX'],
        skippedFeaturedNames: [],
      },
    });

    expect(shouldReportCreditProviderMismatch(key, 1_000)).toBe(true);
    expect(shouldReportCreditProviderMismatch(key, 1_500)).toBe(false);
    expect(
      shouldReportCreditProviderMismatch(key, 1_000 + 60 * 60 * 1000)
    ).toBe(true);
    resetCreditProviderMismatchWarnings();
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

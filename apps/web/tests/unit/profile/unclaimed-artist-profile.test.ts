import { describe, expect, it } from 'vitest';
import {
  buildStructuredCreditProfileMarker,
  isUnclaimedStructuredCreditProfile,
  markStructuredCreditProfileClaimed,
  readStructuredCreditProfileMarker,
} from '@/lib/profile/unclaimed-artist-profile';

const marker = buildStructuredCreditProfileMarker({
  artistRegistryId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
  providerArtistId: 'spotify-austin',
});

describe('structured-credit unclaimed profile contract', () => {
  it('creates an explicit non-consent, non-ownership marker', () => {
    expect(marker).toEqual({
      state: 'unclaimed',
      source: 'structured_spotify_release_credit',
      artistRegistryId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
      provider: 'spotify',
      providerArtistId: 'spotify-austin',
      ownershipVerified: false,
      representationVerified: false,
      consentObtained: false,
    });
    expect(
      isUnclaimedStructuredCreditProfile({ unclaimedArtistProfile: marker })
    ).toBe(true);
  });

  it('rejects malformed or weaker provenance markers', () => {
    expect(
      readStructuredCreditProfileMarker({
        unclaimedArtistProfile: { ...marker, providerArtistId: null },
      })
    ).toBeNull();
    expect(
      isUnclaimedStructuredCreditProfile({
        unclaimedArtistProfile: { ...marker, ownershipVerified: true },
      })
    ).toBe(false);
  });

  it('moves only a valid marker to claimed without implying representation', () => {
    const settings = markStructuredCreditProfileClaimed(
      { unclaimedArtistProfile: marker, preserved: true },
      new Date('2026-08-04T12:00:00.000Z')
    );

    expect(settings).toMatchObject({
      preserved: true,
      unclaimedArtistProfile: {
        state: 'claimed',
        ownershipVerified: true,
        representationVerified: false,
        consentObtained: true,
        claimedAt: '2026-08-04T12:00:00.000Z',
      },
    });
    expect(isUnclaimedStructuredCreditProfile(settings)).toBe(false);
  });
});

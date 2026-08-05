import { describe, expect, it } from 'vitest';
import {
  projectStructuredReleaseCollaborators,
  type StructuredReleaseCollaboratorRow,
} from '@/lib/discography/artist-queries/artist-search';

const ownerProfileId = 'b1951748-2dc2-49f9-8b8e-a24cbe33d67f';

function row(
  overrides: Partial<StructuredReleaseCollaboratorRow> = {}
): StructuredReleaseCollaboratorRow {
  return {
    artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
    artistName: 'Austin Leeds',
    artistSpotifyId: 'spotify-austin',
    artistProfileId: 'ce9ee7b4-67b8-4b3e-a077-698d42893ddb',
    profileIsPublic: true,
    profileIsClaimed: false,
    creditName: null,
    role: 'main_artist',
    position: 1,
    releaseId: '143744e8-4f00-40a4-81d7-77786edc31bd',
    releaseTitle: 'Take Me Over (Austin Leeds Remix)',
    releaseSlug: 'take-me-over-austin-leeds-remix',
    releaseDate: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function project(rows: StructuredReleaseCollaboratorRow[]) {
  return projectStructuredReleaseCollaborators({
    creatorProfileId: ownerProfileId,
    ownerSpotifyId: 'spotify-owner',
    rows,
    limit: 24,
  });
}

describe('structured release collaborator projection', () => {
  it('dedupes repeated imports by stable release/artist/role edge', () => {
    const duplicate = row();
    const result = project([duplicate, { ...duplicate }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      artistId: duplicate.artistId,
      releaseId: duplicate.releaseId,
      href: `/artists/${duplicate.artistId}`,
      profileState: 'unclaimed',
    });
  });

  it('keeps same-name artists distinct and uses a credit alias only for display', () => {
    const result = project([
      row({ creditName: 'Alex Lee', artistName: 'Alexander Lee' }),
      row({
        artistId: 'e061a679-466c-465a-a545-64a7e39aa3c6',
        artistName: 'Alex Lee',
        artistSpotifyId: 'spotify-alex-two',
        artistProfileId: '31fd1831-bac4-44a4-a9eb-f8ce69a786cc',
        profileIsClaimed: true,
        releaseId: 'c568cbb1-8bdb-4b66-acf7-5c3a94d94342',
        releaseTitle: 'Southbound',
        releaseSlug: 'southbound',
      }),
    ]);

    expect(result.map(item => item.name)).toEqual(['Alex Lee', 'Alex Lee']);
    expect(result.map(item => item.artistId)).toEqual([
      'f5441adb-6789-449a-9553-ab7460c9c61c',
      'e061a679-466c-465a-a545-64a7e39aa3c6',
    ]);
    expect(result.map(item => item.profileState)).toEqual([
      'unclaimed',
      'claimed',
    ]);
  });

  it('excludes the owner by exact profile or Spotify identity, never by name', () => {
    const sameDisplayNameDifferentIdentity = row({ artistName: 'DJ Test' });
    const result = project([
      row({
        artistId: '61e6d433-857c-4c78-b9cf-ce0b31865ca8',
        artistProfileId: ownerProfileId,
      }),
      row({
        artistId: '43afe32f-bf34-4c55-835c-90462a4a9d4a',
        artistProfileId: null,
        artistSpotifyId: 'spotify-owner',
      }),
      sameDisplayNameDifferentIdentity,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.artistId).toBe(sameDisplayNameDifferentIdentity.artistId);
  });

  it('keeps unavailable identities as plain-text candidates and excludes non-artist roles', () => {
    const result = project([
      row({
        artistProfileId: null,
        profileIsPublic: null,
        profileIsClaimed: null,
      }),
      row({
        artistId: '0c9e3385-81d2-42c1-83d2-a5bf08942d49',
        role: 'mix_engineer',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      href: null,
      profileState: 'unavailable',
    });
  });

  it('does not expose a profile binding that is private', () => {
    const result = project([
      row({ profileIsPublic: false, profileIsClaimed: true }),
    ]);

    expect(result[0]).toMatchObject({
      href: null,
      profileState: 'unavailable',
    });
  });
});

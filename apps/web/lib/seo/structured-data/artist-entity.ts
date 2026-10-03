import type { CreatorType } from '@/types/db';

export type ProfileSchemaEntityType = 'Person' | ['MusicGroup', 'Person'];

/** Music artists resolve as MusicGroup + Person. Other creator types are Person. */
export function resolveArtistEntityType(
  creatorType: CreatorType
): ProfileSchemaEntityType {
  return creatorType === 'artist' ? ['MusicGroup', 'Person'] : 'Person';
}

/** Fragment that matches the profile entity @id for this creator type. */
export function profileEntityAnchor(
  creatorType: CreatorType | null | undefined
): 'musicgroup' | 'person' {
  return creatorType === 'artist' ? 'musicgroup' : 'person';
}

/** Releases map to MusicAlbum + MusicRelease; tracks stay MusicRecording. */
export function resolveMusicContentSchemaType(
  contentType: 'release' | 'track'
): 'MusicRecording' | ['MusicAlbum', 'MusicRelease'] {
  return contentType === 'release'
    ? ['MusicAlbum', 'MusicRelease']
    : 'MusicRecording';
}

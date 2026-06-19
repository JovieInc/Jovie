import type { CreatorType } from '@/types/db';

/** Solo music artists resolve as MusicGroup + Person for entity-home signals. */
export function resolveArtistEntityType(
  creatorType: CreatorType
): 'MusicGroup' | ['MusicGroup', 'Person'] {
  return creatorType === 'artist' ? ['MusicGroup', 'Person'] : 'MusicGroup';
}

/** Releases map to MusicAlbum + MusicRelease; tracks stay MusicRecording. */
export function resolveMusicContentSchemaType(
  contentType: 'release' | 'track'
): 'MusicRecording' | ['MusicAlbum', 'MusicRelease'] {
  return contentType === 'release'
    ? ['MusicAlbum', 'MusicRelease']
    : 'MusicRecording';
}

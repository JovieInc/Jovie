import type { ReleaseType } from './types';

export type SpotifyAlbumType = 'album' | 'single' | 'compilation';

const EP_MIN_TRACKS = 4;
const EP_MAX_TRACKS = 6;

/**
 * Spotify reports EPs as album_type="single". We infer EP classification from
 * track count for those records.
 */
export function classifySpotifyReleaseType(
  albumType: SpotifyAlbumType,
  totalTracks: number
): ReleaseType {
  if (albumType === 'single' && isEpTrackCount(totalTracks)) {
    return 'ep';
  }

  return albumType;
}

export function isEpTrackCount(totalTracks: number): boolean {
  return totalTracks >= EP_MIN_TRACKS && totalTracks <= EP_MAX_TRACKS;
}

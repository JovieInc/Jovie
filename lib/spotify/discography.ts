import {
  buildSpotifyAlbumUrl,
  buildSpotifyTrackUrl,
  getSpotifyTokenOrThrow,
  SpotifyAlbum,
  SpotifyAlbumDetails,
  SpotifyAlbumTrack,
  SpotifyPagedResponse,
  SpotifyRateLimitError,
  SpotifyTrackDetails,
  spotifyFetch,
} from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';

export interface SpotifyTrackPayload {
  spotifyId: string;
  spotifyUrl: string;
  name: string;
  durationMs: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  explicit: boolean;
  isrc: string | null;
  previewUrl: string | null;
  artists: Array<{ id?: string; name: string }>;
}

export interface SpotifyReleasePayload {
  spotifyId: string;
  spotifyUrl: string;
  name: string;
  albumType: string;
  releaseDate: string | null;
  releaseDatePrecision: string | null;
  totalTracks: number | null;
  upc: string | null;
  imageUrl: string | null;
  artists: Array<{ id?: string; name: string }>;
  tracks: SpotifyTrackPayload[];
}

interface AlbumContext {
  album: SpotifyAlbum;
  details: SpotifyAlbumDetails;
  tracks: SpotifyAlbumTrack[];
  trackDetails: Map<string, SpotifyTrackDetails>;
}

async function fetchArtistAlbums(
  artistId: string,
  token: string
): Promise<SpotifyAlbum[]> {
  const albumMap = new Map<string, SpotifyAlbum>();

  let nextUrl: string | null =
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,compilation&limit=50&market=US`;

  while (nextUrl) {
    const page: SpotifyPagedResponse<SpotifyAlbum> = await spotifyFetch(
      nextUrl,
      token
    );

    for (const album of page.items) {
      if (!albumMap.has(album.id)) {
        albumMap.set(album.id, album);
      }
    }

    nextUrl = page.next;
  }

  return Array.from(albumMap.values());
}

async function fetchAlbumDetails(
  albumId: string,
  token: string
): Promise<SpotifyAlbumDetails> {
  return spotifyFetch<SpotifyAlbumDetails>(
    `https://api.spotify.com/v1/albums/${albumId}?market=US`,
    token
  );
}

async function fetchTracksForAlbum(
  album: SpotifyAlbumDetails,
  token: string
): Promise<SpotifyAlbumTrack[]> {
  const tracks: SpotifyAlbumTrack[] = [...(album.tracks?.items ?? [])];
  let nextUrl = album.tracks?.next ?? null;

  while (nextUrl) {
    const page: SpotifyPagedResponse<SpotifyAlbumTrack> = await spotifyFetch(
      nextUrl,
      token
    );
    tracks.push(...page.items);
    nextUrl = page.next;
  }

  return tracks;
}

async function fetchTrackDetails(
  trackIds: string[],
  token: string
): Promise<Map<string, SpotifyTrackDetails>> {
  const details = new Map<string, SpotifyTrackDetails>();

  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    const response = await spotifyFetch<{ tracks: SpotifyTrackDetails[] }>(
      `https://api.spotify.com/v1/tracks?ids=${batch.join(',')}&market=US`,
      token
    );

    for (const track of response.tracks) {
      if (track?.id) {
        details.set(track.id, track);
      }
    }
  }

  return details;
}

function buildAlbumContext(
  album: SpotifyAlbum,
  details: SpotifyAlbumDetails,
  tracks: SpotifyAlbumTrack[],
  trackDetails: Map<string, SpotifyTrackDetails>
): SpotifyReleasePayload {
  const fallbackAlbumType = details.album_group ?? details.album_type;

  const normalizedTracks = tracks.map(track => {
    const detail = trackDetails.get(track.id);

    return {
      spotifyId: track.id,
      spotifyUrl:
        track.external_urls?.spotify ?? buildSpotifyTrackUrl(track.id ?? ''),
      name: track.name,
      durationMs: detail?.duration_ms ?? track.duration_ms ?? null,
      trackNumber: track.track_number ?? null,
      discNumber: track.disc_number ?? null,
      explicit: Boolean(track.explicit),
      isrc: detail?.external_ids?.isrc ?? null,
      previewUrl: track.preview_url ?? detail?.preview_url ?? null,
      artists: track.artists ?? detail?.artists ?? [],
    } satisfies SpotifyTrackPayload;
  });

  return {
    spotifyId: album.id,
    spotifyUrl:
      album.external_urls?.spotify ?? buildSpotifyAlbumUrl(details.id),
    name: album.name,
    albumType: fallbackAlbumType ?? 'album',
    releaseDate: album.release_date ?? details.release_date ?? null,
    releaseDatePrecision:
      album.release_date_precision ?? details.release_date_precision ?? null,
    totalTracks: album.total_tracks ?? details.total_tracks ?? tracks.length,
    upc: details.external_ids?.upc ?? null,
    imageUrl: album.images?.[0]?.url ?? details.images?.[0]?.url ?? null,
    artists: details.artists ?? [],
    tracks: normalizedTracks,
  };
}

async function buildAlbumContexts(
  album: SpotifyAlbum,
  token: string
): Promise<AlbumContext> {
  const details = await fetchAlbumDetails(album.id, token);
  const tracks = await fetchTracksForAlbum(details, token);
  const trackDetails = await fetchTrackDetails(
    tracks.map(track => track.id),
    token
  );

  return { album, details, tracks, trackDetails };
}

export async function fetchSpotifyDiscography(
  spotifyArtistId: string
): Promise<SpotifyReleasePayload[]> {
  const token = await getSpotifyTokenOrThrow();

  const albums = await fetchArtistAlbums(spotifyArtistId, token);
  const releases: SpotifyReleasePayload[] = [];

  for (const album of albums) {
    try {
      const context = await buildAlbumContexts(album, token);
      releases.push(
        buildAlbumContext(
          context.album,
          context.details,
          context.tracks,
          context.trackDetails
        )
      );
    } catch (error) {
      logger.error('Failed to process Spotify album', {
        albumId: album.id,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : String(error),
      });

      if (error instanceof SpotifyRateLimitError) {
        throw error;
      }
    }
  }

  return releases;
}

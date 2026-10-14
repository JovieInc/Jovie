import { captureError } from '@/lib/error-tracking';
import {
  getSpotifyArtist as getSpotifyArtistFromClient,
  getSpotifyArtistsBatch as getSpotifyArtistsBatchFromClient,
  spotifyClient,
} from '@/lib/spotify/client';
import type { SanitizedArtist } from '@/lib/spotify/sanitize';

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: Array<{ url: string; height: number; width: number }>;
  popularity: number;
  followers?: { total: number };
  genres?: string[];
}

// Spotify Album types
export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: 'album' | 'single' | 'compilation';
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  total_tracks: number;
  popularity?: number;
  images: SpotifyImage[];
  external_urls: {
    spotify: string;
  };
  uri: string;
  artists: Array<{
    id: string;
    name: string;
    external_urls: { spotify: string };
  }>;
}

export interface SpotifyAlbumTrackCollection {
  items: SpotifyTrack[];
  total: number;
  next: string | null;
  limit?: number;
  offset?: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  track_number: number;
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: {
    spotify: string;
  };
  uri: string;
  preview_url: string | null;
  external_ids?: {
    isrc?: string;
  };
  artists: Array<{
    id: string;
    name: string;
  }>;
  linked_from?: {
    id: string;
  };
}

export interface SpotifyTrackFull extends SpotifyTrack {
  external_ids?: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
}

export interface SpotifyAlbumFull extends SpotifyAlbum {
  tracks: SpotifyAlbumTrackCollection;
  label: string;
  popularity: number;
  genres?: string[];
  copyrights: Array<{ text: string; type: string }>;
  external_ids?: {
    upc?: string;
  };
}

interface SpotifyAlbumsResponse {
  items: SpotifyAlbum[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

interface SpotifyAlbumTracksPage {
  items: SpotifyTrack[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface SpotifyArtistAlbumsResult {
  albums: SpotifyAlbum[];
  total: number;
  complete: boolean;
  issue?: string;
}

export interface SpotifyAlbumTracksResult {
  albumId: string;
  tracks: SpotifyTrack[];
  total: number | null;
  complete: boolean;
  issue?: string;
}

// Search for artists on Spotify
export async function searchSpotifyArtists(
  query: string,
  limit: number = 5
): Promise<SpotifyArtist[]> {
  try {
    const data = await spotifyClient.requestJson<SpotifySearchResponse>(
      `/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`
    );

    return data.artists.items;
  } catch {
    return [];
  }
}

// Get artist details from Spotify
export async function getSpotifyArtist(
  artistId: string
): Promise<SpotifyArtist | null> {
  const artist = await getSpotifyArtistFromClient(artistId);
  return artist ? mapSanitizedArtist(artist) : null;
}

/**
 * Get multiple artists in a single request (max 50 per chunk).
 * Uses the Spotify /artists?ids= batch endpoint.
 */
export async function getSpotifyArtistsBatch(
  artistIds: string[]
): Promise<SpotifyArtist[]> {
  const artists = await getSpotifyArtistsBatchFromClient(artistIds);
  return artists.map(mapSanitizedArtist);
}

function mapSanitizedArtist(artist: SanitizedArtist): SpotifyArtist {
  return {
    id: artist.spotifyId,
    name: artist.name,
    images: artist.imageUrl
      ? [{ url: artist.imageUrl, height: 0, width: 0 }]
      : [],
    popularity: artist.popularity,
    followers: { total: artist.followerCount },
    genres: artist.genres,
  };
}

// Build Spotify artist URL from artist ID
export function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

// Build Spotify album URL from album ID
export function buildSpotifyAlbumUrl(albumId: string): string {
  return `https://open.spotify.com/album/${albumId}`;
}

// Build Spotify track URL from track ID
export function buildSpotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Get all albums for an artist from Spotify
 * Fetches singles, albums, and compilations
 */
export async function getSpotifyArtistAlbums(
  artistId: string,
  options: {
    includeGroups?: ('album' | 'single' | 'compilation' | 'appears_on')[];
    limit?: number;
    market?: string;
  } = {}
): Promise<SpotifyArtistAlbumsResult> {
  const includeGroups = options.includeGroups ?? [
    'album',
    'single',
    'compilation',
  ];
  const limit = options.limit ?? 10;
  const market = options.market ?? 'US';

  const albums: SpotifyAlbum[] = [];
  let totalFromApi = 0;
  let offset = 0;
  let hasMore = true;
  let issue: string | undefined;
  const seenAlbumIds = new Set<string>();

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    return {
      albums,
      total: 0,
      complete: false,
      issue: 'Spotify artist album page limit must be between 1 and 10',
    };
  }

  try {
    while (hasMore) {
      const params = new URLSearchParams({
        include_groups: includeGroups.join(','),
        limit: String(limit),
        offset: String(offset),
        market,
      });

      const data = await spotifyClient.requestJson<SpotifyAlbumsResponse>(
        `/artists/${artistId}/albums?${params}`
      );
      if (!Number.isSafeInteger(data.total) || data.total < 0) {
        issue = 'Spotify returned an invalid artist album total';
        break;
      }

      if (offset === 0) {
        totalFromApi = data.total;
      } else if (data.total !== totalFromApi) {
        issue = 'Spotify artist album total changed during pagination';
        break;
      }

      if (data.offset !== offset || !Array.isArray(data.items)) {
        issue = `Spotify artist album page at offset ${offset} was invalid`;
        break;
      }
      if (data.limit !== limit) {
        issue = `Spotify artist album page at offset ${offset} returned limit ${data.limit} when ${limit} was requested`;
        break;
      }

      const expectedPageLength = Math.min(limit, data.total - offset);
      if (data.items.length !== expectedPageLength) {
        issue = `Spotify artist album page at offset ${offset} returned ${data.items.length} of ${expectedPageLength} expected items`;
        break;
      }

      for (const album of data.items) {
        if (!album || typeof album.id !== 'string' || album.id.trim() === '') {
          issue = `Spotify artist album page at offset ${offset} contained an album without an ID`;
          break;
        }
        if (seenAlbumIds.has(album.id)) {
          issue = `Spotify artist album pagination repeated album ${album.id}`;
          break;
        }
        seenAlbumIds.add(album.id);
        albums.push(album);
      }
      if (issue) break;

      const nextOffset = offset + data.items.length;
      const expectsMore = nextOffset < data.total;
      if (Boolean(data.next) !== expectsMore) {
        issue = `Spotify artist album pagination ended inconsistently at offset ${offset}`;
        break;
      }

      if (albums.length >= 500) {
        if (albums.length < data.total) {
          issue = `Spotify artist album pagination reached the 500 album cap with ${data.total} albums available`;
        }
        hasMore = false;
      } else if (expectsMore) {
        offset = nextOffset;
      } else {
        hasMore = false;
      }
    }

    return {
      albums,
      total: totalFromApi,
      complete: issue === undefined && albums.length === totalFromApi,
      ...(issue ? { issue } : {}),
    };
  } catch (error) {
    await captureError('Failed to fetch Spotify artist albums', error, {
      artistId,
      operation: 'getSpotifyArtistAlbums',
    });
    return {
      albums,
      total: totalFromApi,
      complete: false,
      issue: `Failed to fetch Spotify artist albums: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

const SPOTIFY_ALBUM_TRACKS_PAGE_SIZE = 50;
const SPOTIFY_ALBUM_TRACKS_MAX_TRACKS = 1000;

/**
 * Fetch every track in one Spotify album, continuing an embedded album page
 * when available. A partial listing is returned as incomplete evidence so a
 * caller cannot mistake an unavailable or repeated page for a clean catalog.
 */
export async function getSpotifyAlbumTracks(
  albumId: string,
  initialPage?: SpotifyAlbumTrackCollection,
  market: string = 'US'
): Promise<SpotifyAlbumTracksResult> {
  const tracks: SpotifyTrack[] = [];
  const seenTrackIds = new Set<string>();
  let total: number | null = null;
  let offset = 0;
  let pageIndex = 0;
  let page = initialPage;

  const incomplete = (issue: string): SpotifyAlbumTracksResult => ({
    albumId,
    tracks,
    total,
    complete: false,
    issue,
  });

  while (true) {
    try {
      if (!page) {
        const params = new URLSearchParams({
          limit: String(SPOTIFY_ALBUM_TRACKS_PAGE_SIZE),
          offset: String(offset),
          market,
        });
        page = await spotifyClient.requestJson<SpotifyAlbumTracksPage>(
          `/albums/${encodeURIComponent(albumId)}/tracks?${params}`
        );
      }
    } catch (error) {
      await captureError('Failed to fetch Spotify album tracks', error, {
        albumId,
        offset,
        operation: 'getSpotifyAlbumTracks',
      });
      return incomplete(
        `Failed to fetch Spotify album ${albumId} tracks at offset ${offset}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (
      !page ||
      !Array.isArray(page.items) ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0
    ) {
      return incomplete(
        `Spotify album ${albumId} returned an invalid track page at offset ${offset}`
      );
    }

    if (total === null) {
      total = page.total;
    } else if (page.total !== total) {
      return incomplete(
        `Spotify album ${albumId} track total changed during pagination`
      );
    }

    if (total > SPOTIFY_ALBUM_TRACKS_MAX_TRACKS) {
      return incomplete(
        `Spotify album ${albumId} exceeds the ${SPOTIFY_ALBUM_TRACKS_MAX_TRACKS} track audit limit`
      );
    }

    if (
      (page.offset !== undefined || !initialPage || pageIndex > 0) &&
      page.offset !== offset
    ) {
      return incomplete(
        `Spotify album ${albumId} returned track offset ${page.offset} when ${offset} was requested`
      );
    }

    const pageLimit =
      page.limit ??
      (pageIndex === 0 && page.items.length > 0
        ? page.items.length
        : SPOTIFY_ALBUM_TRACKS_PAGE_SIZE);
    if (
      !Number.isSafeInteger(pageLimit) ||
      pageLimit < 1 ||
      pageLimit > SPOTIFY_ALBUM_TRACKS_PAGE_SIZE ||
      ((!initialPage || pageIndex > 0) &&
        pageLimit !== SPOTIFY_ALBUM_TRACKS_PAGE_SIZE)
    ) {
      return incomplete(
        `Spotify album ${albumId} returned an invalid page limit at offset ${offset}`
      );
    }

    const expectedPageLength = Math.min(pageLimit, total - offset);
    if (page.items.length !== expectedPageLength) {
      return incomplete(
        `Spotify album ${albumId} track page at offset ${offset} returned ${page.items.length} of ${expectedPageLength} expected items`
      );
    }

    for (const track of page.items) {
      if (!track || typeof track.id !== 'string' || track.id.trim() === '') {
        return incomplete(
          `Spotify album ${albumId} track page at offset ${offset} contained a track without an ID`
        );
      }
      if (seenTrackIds.has(track.id)) {
        return incomplete(
          `Spotify album ${albumId} track pagination repeated track ${track.id}`
        );
      }
      if (track.linked_from) {
        return incomplete(
          `Spotify relinked track ${track.linked_from.id || 'with unknown source ID'} to ${track.id} in album ${albumId}`
        );
      }
      seenTrackIds.add(track.id);
      tracks.push(track);
    }

    const nextOffset = offset + page.items.length;
    const expectsMore = nextOffset < total;
    if (Boolean(page.next) !== expectsMore) {
      return incomplete(
        `Spotify album ${albumId} track pagination ended inconsistently at offset ${offset}`
      );
    }

    if (!expectsMore) {
      if (tracks.length !== total) {
        return incomplete(
          `Spotify album ${albumId} returned ${tracks.length} of ${total} tracks`
        );
      }
      return { albumId, tracks, total, complete: true };
    }

    offset = nextOffset;
    pageIndex += 1;
    page = undefined;
  }
}

/**
 * Get full album details including tracks
 */
export async function getSpotifyAlbum(
  albumId: string,
  market: string = 'US'
): Promise<SpotifyAlbumFull | null> {
  try {
    return await spotifyClient.requestJson<SpotifyAlbumFull>(
      `/albums/${albumId}?market=${market}`
    );
  } catch (error) {
    await captureError('Failed to fetch Spotify album', error, {
      albumId,
      operation: 'getSpotifyAlbum',
    });
    return null;
  }
}

/**
 * Get multiple albums in a single request (max 20)
 */
export async function getSpotifyAlbums(
  albumIds: string[],
  market: string = 'US'
): Promise<SpotifyAlbumFull[]> {
  if (albumIds.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < albumIds.length; i += 20) {
    chunks.push(albumIds.slice(i, i + 20));
  }

  const albums: SpotifyAlbumFull[] = [];

  try {
    for (const chunk of chunks) {
      const data = await spotifyClient.requestJson<{
        albums: SpotifyAlbumFull[];
      }>(`/albums?ids=${chunk.join(',')}&market=${market}`);
      albums.push(...data.albums.filter(Boolean));
    }

    return albums;
  } catch (error) {
    await captureError('Failed to fetch Spotify albums batch', error, {
      albumIdsCount: albumIds.length,
      operation: 'getSpotifyAlbums',
    });
    return [];
  }
}

/**
 * Get multiple tracks in a single request (max 50)
 */
export async function getSpotifyTracks(
  trackIds: string[],
  market: string = 'US'
): Promise<SpotifyTrackFull[]> {
  if (trackIds.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    chunks.push(trackIds.slice(i, i + 50));
  }

  console.info(
    `[spotify] getSpotifyTracks: fetching ${trackIds.length} track(s) in ${chunks.length} chunk(s)`
  );

  const tracks: SpotifyTrackFull[] = [];

  try {
    for (const chunk of chunks) {
      const data = await spotifyClient.requestJson<{
        tracks: SpotifyTrackFull[];
      }>(`/tracks?ids=${chunk.join(',')}&market=${market}`);
      tracks.push(...data.tracks.filter(Boolean));
    }

    return tracks;
  } catch (error) {
    await captureError('Failed to fetch Spotify tracks batch', error, {
      trackIdsCount: trackIds.length,
      operation: 'getSpotifyTracks',
    });
    return [];
  }
}

/**
 * Map Spotify album_type to our release type
 */
export function mapSpotifyAlbumType(
  albumType: SpotifyAlbum['album_type']
): 'single' | 'ep' | 'album' | 'compilation' {
  switch (albumType) {
    case 'single':
      return 'single';
    case 'compilation':
      return 'compilation';
    case 'album':
    default:
      return 'album';
  }
}

/**
 * Parse Spotify release date to Date object
 * Handles year, month, and day precision
 */
export function parseSpotifyReleaseDate(
  releaseDate: string,
  precision: SpotifyAlbum['release_date_precision']
): Date {
  switch (precision) {
    case 'year':
      return new Date(`${releaseDate}-01-01`);
    case 'month':
      return new Date(`${releaseDate}-01`);
    case 'day':
    default:
      return new Date(releaseDate);
  }
}

/**
 * Get the best quality artwork URL from Spotify images
 */
export function getBestSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
  return sorted[0]?.url ?? null;
}

/**
 * Generate a URL-safe slug from a release title
 */
export function generateReleaseSlug(title: string, spotifyId: string): string {
  if (!title || !spotifyId) return '';

  const slugified = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 50);

  const shortId = spotifyId.slice(-6);
  return `${slugified}-${shortId}`;
}

export {
  isSpotifyAvailable,
  type SearchArtistResult,
  spotifyClient,
} from '@/lib/spotify/client';

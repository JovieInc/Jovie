/**
 * Spotify API type definitions
 */

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images?: Array<{ url: string; height: number; width: number }>;
  popularity: number;
  followers?: { total: number };
}

export interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
}

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
}

export interface SpotifyAlbumFull extends SpotifyAlbum {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    next: string | null;
  };
  label: string;
  copyrights: Array<{ text: string; type: string }>;
  external_ids?: {
    upc?: string;
  };
}

export interface SpotifyAlbumsResponse {
  items: SpotifyAlbum[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export type AlbumIncludeGroup =
  | 'album'
  | 'single'
  | 'compilation'
  | 'appears_on';

export interface GetArtistAlbumsOptions {
  includeGroups?: AlbumIncludeGroup[];
  limit?: number;
  market?: string;
}

export type ProviderKey =
  | 'spotify'
  | 'apple_music'
  | 'youtube'
  | 'soundcloud'
  | 'deezer'
  | 'tidal'
  | 'amazon_music'
  | 'bandcamp'
  | 'beatport';

export type ProviderSource = 'ingested' | 'manual';

export interface ProviderLink {
  key: ProviderKey;
  url: string;
  source: ProviderSource;
  updatedAt: string;
}

export interface ReleaseTemplate {
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  providers: Partial<Record<ProviderKey, string>>;
}

export interface ReleaseRecord {
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  slug: string;
  providers: ProviderLink[];
}

export type ReleaseType =
  | 'single'
  | 'ep'
  | 'album'
  | 'compilation'
  | 'live'
  | 'mixtape'
  | 'other';

/** Canvas video status for a release */
export type CanvasStatus = 'unknown' | 'not_set' | 'generated' | 'uploaded';

export interface ReleaseViewModel {
  profileId: string;
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  slug: string;
  smartLinkPath: string;
  spotifyPopularity?: number | null;
  providers: Array<
    ProviderLink & {
      label: string;
      path: string;
      isPrimary: boolean;
    }
  >;
  // Extended fields for table display
  releaseType: ReleaseType;
  upc?: string | null;
  label?: string | null;
  totalTracks: number;
  totalDurationMs?: number | null;
  primaryIsrc?: string | null;
  genres?: string[];
  /** Spotify Canvas video status for this release */
  canvasStatus?: CanvasStatus;
}

/** Track view model for display in expandable release rows */
export interface TrackViewModel {
  id: string;
  releaseId: string;
  title: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  providers: Array<
    ProviderLink & {
      label: string;
      path: string;
      isPrimary: boolean;
    }
  >;
}

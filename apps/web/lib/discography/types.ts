export type ProviderKey =
  | 'spotify'
  | 'apple_music'
  | 'youtube'
  | 'soundcloud'
  | 'deezer'
  | 'tidal'
  | 'amazon_music'
  | 'bandcamp'
  | 'beatport'
  | 'pandora'
  | 'napster'
  | 'audiomack'
  | 'qobuz'
  | 'anghami'
  | 'boomplay'
  | 'iheartradio'
  | 'tiktok';

/** Short-form video provider keys for "Use this sound" feature */
export type VideoProviderKey =
  | 'tiktok_sound'
  | 'instagram_reels'
  | 'youtube_shorts';

/** Union of all provider key types (music streaming + video) */
export type AnyProviderKey = ProviderKey | VideoProviderKey;

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

import type { CanvasStatus } from '@/lib/services/canvas/types';

export type { CanvasStatus } from '@/lib/services/canvas/types';

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
  /** Original DSP-ingested artwork URL (available when user has uploaded custom art) */
  originalArtworkUrl?: string;
  /** Whether this release has short-form video provider links (TikTok, Reels, Shorts) */
  hasVideoLinks?: boolean;
}

/** Track view model for display in expandable release rows */
export interface TrackViewModel {
  id: string;
  releaseId: string;
  title: string;
  slug: string;
  smartLinkPath: string;
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

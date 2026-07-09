export type ProviderKey =
  | 'spotify'
  | 'apple_music'
  | 'youtube'
  | 'youtube_music'
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
  | 'tiktok'
  | 'amazon'
  | 'awa'
  | 'audius'
  | 'flo'
  | 'gaana'
  | 'jio_saavn'
  | 'joox'
  | 'kkbox'
  | 'line_music'
  | 'netease'
  | 'qq_music'
  | 'trebel'
  | 'yandex';

/** Short-form video provider keys for "Use this sound" feature */
export type VideoProviderKey =
  | 'tiktok_sound'
  | 'instagram_reels'
  | 'youtube_shorts';

/** Union of all provider key types (music streaming + video) */
export type AnyProviderKey = ProviderKey | VideoProviderKey;

export type ProviderSource = 'ingested' | 'manual';

export type PreviewSource =
  | 'audio_url'
  | 'spotify'
  | 'apple_music'
  | 'deezer'
  | 'musicfetch'
  | null;

export type PreviewVerification =
  | 'verified'
  | 'fallback'
  | 'unknown'
  | 'missing';

export type ProviderConfidence =
  | 'canonical'
  | 'search_fallback'
  | 'manual_override'
  | 'unknown';

export interface ProviderConfidenceSummary {
  canonical: number;
  searchFallback: number;
  unknown: number;
  unresolvedProviders?: ProviderKey[];
}

export interface PreviewCounts {
  verified: number;
  fallback: number;
  unknown: number;
  missing: number;
}

export interface ProviderLink {
  key: ProviderKey;
  url: string;
  source: ProviderSource;
  updatedAt: string;
  confidence?: ProviderConfidence;
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
  | 'music_video'
  | 'other';

/** Metadata stored in discogReleases.metadata JSONB for music_video releases */
export interface MusicVideoMetadata {
  youtubeVideoId: string;
  youtubeThumbnailUrl?: string;
  youtubePremiereDate?: string;
  youtubeChannelId?: string;
  youtubeChannelName?: string;
  duration?: number;
}

import type { CanvasStatus } from '@/lib/services/canvas/types';

export type { CanvasStatus } from '@/lib/services/canvas/types';

export interface ReleaseViewModel {
  profileId: string;
  id: string;
  title: string;
  artistNames?: string[];
  releaseDate?: string;
  status: 'draft' | 'scheduled' | 'released';
  revealDate?: string;
  deletedAt?: string;
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
  isExplicit: boolean;
  upc?: string | null;
  label?: string | null;
  totalTracks: number;
  totalDiscs?: number;
  totalDurationMs?: number | null;
  primaryIsrc?: string | null;
  genres?: string[];
  /** Per-release target playlists for pitch generation */
  targetPlaylists?: string[];
  /** ℗ phonographic copyright line */
  copyrightLine?: string | null;
  /** © copyright / distributor line */
  distributor?: string | null;
  /** Spotify Canvas video status for this release */
  canvasStatus?: CanvasStatus;
  /** Uploaded or generated canvas video URL for hover scrub previews */
  canvasVideoUrl?: string | null;
  /** Original DSP-ingested artwork URL (available when user has uploaded custom art) */
  originalArtworkUrl?: string;
  /** Whether this release has short-form video provider links (TikTok, Reels, Shorts) */
  hasVideoLinks?: boolean;
  /** Editable lyrics text stored in release metadata */
  lyrics?: string;
  /** Preview audio URL (typically from the primary track) */
  previewUrl?: string | null;
  previewCounts?: PreviewCounts;
  /**
   * Weekly engagement metric for the releases list: non-bot smart-link
   * click-throughs recorded in the trailing 7 days. Sourced from the
   * canonical analytics metrics layer (no DSP stream-count ingestion exists
   * yet). `undefined`/`null` means no data — render a placeholder.
   */
  weeklyStreams?: number | null;
  providerCounts?: ProviderConfidenceSummary;
  /** Latest AI-generated release pitch draft or legacy per-platform pitch set */
  generatedPitches?: {
    spotify?: string;
    amazon?: string;
    appleMusic?: string;
    generic?: string;
    target?: string;
    platform?: string | null;
    destinationLabel?: string;
    audience?: string;
    subjectLine?: string | null;
    body?: string;
    generatedAt: string;
    modelUsed: string;
  } | null;
}

/** Track view model for display in expandable release rows */
export interface TrackViewModel {
  id: string;
  /** Release-track junction ID (new model) — absent for legacy data */
  releaseTrackId?: string;
  /** Canonical recording ID (new model) — absent for legacy data */
  recordingId?: string;
  releaseId: string;
  /** Parent release slug for constructing nested deep link paths */
  releaseSlug: string;
  title: string;
  slug: string;
  smartLinkPath: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  lyrics?: string | null;
  previewSource?: PreviewSource;
  previewVerification?: PreviewVerification;
  providerConfidenceSummary?: ProviderConfidenceSummary;
  providers: Array<
    ProviderLink & {
      label: string;
      path: string;
      isPrimary: boolean;
    }
  >;
}

export type AppRelease = ReleaseViewModel;

export type AppTrack = TrackViewModel;

/** Canonical track contract used by release sidebar and API boundary adapters */
export type ReleaseSidebarTrack = TrackViewModel;

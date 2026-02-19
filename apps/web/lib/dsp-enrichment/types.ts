/**
 * DSP Enrichment System Types
 *
 * Types for cross-platform artist matching, profile enrichment,
 * and new release detection.
 */

export type {
  FanNotificationContentType,
  FanNotificationPreferences,
} from '@/lib/db/schema/analytics';
// Re-export database types
export type {
  DspArtistEnrichment,
  DspArtistMatch,
  DspExternalUrls,
  DspImageUrls,
  DspMatchConfidenceBreakdown,
  FanReleaseNotification,
  NewDspArtistEnrichment,
  NewDspArtistMatch,
  NewFanReleaseNotification,
  NewReleaseSyncStatus,
  NewSocialLinkSuggestion,
  ReleaseSyncStatus,
  SocialLinkSuggestion,
  SocialSuggestionConfidenceBreakdown,
} from '@/lib/db/schema/dsp-enrichment';
export type { NotificationPreferences } from '@/lib/db/schema/profiles';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported DSP provider identifiers
 */
export type DspProviderId =
  | 'spotify'
  | 'apple_music'
  | 'deezer'
  | 'youtube_music'
  | 'tidal'
  | 'soundcloud'
  | 'amazon_music'
  | 'musicbrainz';

/**
 * Match status for DSP artist matches
 */
export type DspMatchStatus =
  | 'suggested'
  | 'confirmed'
  | 'rejected'
  | 'auto_confirmed';

/**
 * Notification types for fan release alerts
 */
export type ReleaseNotificationType = 'preview' | 'release_day';

/**
 * Notification status for fan release notifications
 */
export type ReleaseNotificationStatus =
  | 'pending'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';

/**
 * Social link suggestion status
 */
export type SocialSuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'email_sent'
  | 'expired';

// ============================================================================
// Provider API Response Types
// ============================================================================

/**
 * Apple Music artist from MusicKit API
 */
export interface AppleMusicArtist {
  id: string;
  type: 'artists';
  attributes: {
    name: string;
    genreNames?: string[];
    artwork?: {
      url: string;
      width: number;
      height: number;
    };
    editorialNotes?: {
      short?: string;
      standard?: string;
    };
    origin?: string;
    url: string;
  };
  relationships?: {
    albums?: {
      data: Array<{ id: string; type: 'albums' }>;
    };
  };
}

/**
 * Apple Music album from MusicKit API
 */
export interface AppleMusicAlbum {
  id: string;
  type: 'albums';
  attributes: {
    name: string;
    artistName: string;
    upc?: string;
    releaseDate?: string;
    trackCount: number;
    artwork?: {
      url: string;
      width: number;
      height: number;
    };
    url: string;
  };
}

/**
 * Apple Music track from MusicKit API
 */
export interface AppleMusicTrack {
  id: string;
  type: 'songs';
  attributes: {
    name: string;
    artistName: string;
    albumName?: string;
    isrc?: string;
    durationInMillis?: number;
    url: string;
    artwork?: {
      url: string;
      width: number;
      height: number;
    };
  };
  relationships?: {
    artists?: {
      data: Array<{ id: string; type: 'artists' }>;
    };
    albums?: {
      data: Array<{ id: string; type: 'albums' }>;
    };
  };
}

/**
 * Deezer artist from API
 */
export interface DeezerArtist {
  id: number;
  name: string;
  link: string;
  picture: string;
  picture_small: string;
  picture_medium: string;
  picture_big: string;
  picture_xl: string;
  nb_album?: number;
  nb_fan?: number;
  radio: boolean;
  tracklist: string;
}

/**
 * Deezer track from API
 */
export interface DeezerTrack {
  id: number;
  readable: boolean;
  title: string;
  isrc?: string;
  link: string;
  duration: number;
  track_position?: number;
  disk_number?: number;
  explicit_lyrics: boolean;
  preview: string;
  artist: DeezerArtist;
  album?: {
    id: number;
    title: string;
    link: string;
    cover: string;
  };
}

/**
 * MusicBrainz artist from API
 */
export interface MusicBrainzArtist {
  id: string; // MBID
  name: string;
  'sort-name'?: string;
  disambiguation?: string;
  type?: 'Person' | 'Group' | 'Orchestra' | 'Choir' | 'Character' | 'Other';
  'type-id'?: string;
  country?: string;
  area?: {
    id: string;
    name: string;
    'sort-name'?: string;
    type?: string;
  };
  'begin-area'?: {
    id: string;
    name: string;
    'sort-name'?: string;
  };
  'life-span'?: {
    begin?: string;
    end?: string;
    ended: boolean;
  };
  aliases?: Array<{
    name: string;
    'sort-name'?: string;
    type?: string;
    'type-id'?: string;
    locale?: string;
    primary?: boolean;
  }>;
  tags?: Array<{
    name: string;
    count: number;
  }>;
  relations?: MusicBrainzRelation[];
  isnis?: string[];
  ipis?: string[];
}

/**
 * MusicBrainz relation (URL, artist, label relationships)
 */
export interface MusicBrainzRelation {
  type: string;
  'type-id': string;
  direction?: 'forward' | 'backward';
  url?: {
    id: string;
    resource: string;
  };
  artist?: {
    id: string;
    name: string;
    'sort-name'?: string;
  };
  label?: {
    id: string;
    name: string;
    'sort-name'?: string;
  };
  attributes?: string[];
  begin?: string;
  end?: string;
  ended?: boolean;
}

/**
 * MusicBrainz recording (track) from API
 */
export interface MusicBrainzRecording {
  id: string;
  title: string;
  length?: number;
  isrcs?: string[];
  'artist-credit'?: Array<{
    name: string;
    artist: {
      id: string;
      name: string;
      'sort-name'?: string;
    };
    joinphrase?: string;
  }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    'release-group'?: {
      id: string;
      'primary-type'?: string;
    };
  }>;
}

// ============================================================================
// Matching Algorithm Types
// ============================================================================

/**
 * Weights for confidence scoring
 */
export interface ConfidenceWeights {
  isrcMatch: number;
  upcMatch: number;
  nameSimilarity: number;
  followerRatio: number;
  genreOverlap: number;
}

/**
 * Default confidence weights
 */
export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  isrcMatch: 0.5,
  upcMatch: 0.2,
  nameSimilarity: 0.15,
  followerRatio: 0.1,
  genreOverlap: 0.05,
};

/**
 * Thresholds for auto-confirmation
 */
export interface AutoConfirmThresholds {
  minConfidenceScore: number;
  minMatchingIsrcCount: number;
}

/**
 * Default auto-confirm thresholds
 */
export const DEFAULT_AUTO_CONFIRM_THRESHOLDS: AutoConfirmThresholds = {
  minConfidenceScore: 0.8,
  minMatchingIsrcCount: 3,
};

/**
 * ISRC match result for aggregation
 */
export interface IsrcMatchResult {
  isrc: string;
  localTrackId: string;
  localTrackTitle: string;
  matchedTrack: {
    id: string;
    title: string;
    artistId: string;
    artistName: string;
  };
}

/**
 * Aggregated artist match candidate
 */
export interface ArtistMatchCandidate {
  providerId: DspProviderId;
  externalArtistId: string;
  externalArtistName: string;
  externalArtistUrl?: string;
  externalArtistImageUrl?: string;
  matchingIsrcs: string[];
  matchingUpcs: string[];
  totalTracksChecked: number;
}

/**
 * Confidence band categories for user-facing display
 */
export type ConfidenceBand = 'very_high' | 'high' | 'medium' | 'low';

/**
 * Scored artist match candidate
 */
export interface ScoredArtistMatch extends ArtistMatchCandidate {
  confidenceScore: number;
  /** Confidence band for user-facing display */
  confidenceBand: ConfidenceBand;
  confidenceBreakdown: {
    isrcMatchScore: number;
    upcMatchScore: number;
    nameSimilarityScore: number;
    followerRatioScore: number;
    genreOverlapScore: number;
  };
  shouldAutoConfirm: boolean;
}

// ============================================================================
// Discovery Job Types
// ============================================================================

/**
 * Payload for DSP artist discovery job
 */
export interface DspArtistDiscoveryPayload {
  creatorProfileId: string;
  spotifyArtistId: string;
  targetProviders: DspProviderId[];
  dedupKey: string;
}

/**
 * Result from DSP artist discovery
 */
export interface DspArtistDiscoveryResult {
  creatorProfileId: string;
  matches: Array<{
    providerId: DspProviderId;
    status: DspMatchStatus;
    externalArtistId: string;
    externalArtistName: string;
    confidenceScore: number;
  }>;
  errors: string[];
}

/**
 * Payload for DSP track enrichment job
 */
export interface DspTrackEnrichmentPayload {
  creatorProfileId: string;
  matchId: string;
  providerId: DspProviderId;
  externalArtistId: string;
  batchSize?: number;
}

/**
 * Result from DSP track enrichment
 */
export interface DspTrackEnrichmentResult {
  creatorProfileId: string;
  providerId: DspProviderId;
  tracksEnriched: number;
  releasesEnriched: number;
  errors: string[];
}

/**
 * Payload for discography sync job
 */
export interface DiscographySyncPayload {
  creatorProfileId: string;
  providerId: DspProviderId;
  externalArtistId: string;
  isIncremental: boolean;
}

/**
 * Result from discography sync
 */
export interface DiscographySyncResult {
  creatorProfileId: string;
  providerId: DspProviderId;
  newReleasesFound: number;
  releasesUpdated: number;
  errors: string[];
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Notification categories with metadata
 */
export interface NotificationCategory {
  name: string;
  description: string;
  group: NotificationGroup;
  defaultEnabled: boolean;
}

/**
 * Notification groups
 */
export type NotificationGroup =
  | 'fan_notifications'
  | 'profile_suggestions'
  | 'profile_updates';

/**
 * All notification categories
 */
export const NOTIFICATION_CATEGORIES: Record<string, NotificationCategory> = {
  release_preview: {
    name: 'Upcoming Release Previews',
    description: 'Get notified 1 week before an artist releases new music',
    group: 'fan_notifications',
    defaultEnabled: true,
  },
  release_day: {
    name: 'New Release Alerts',
    description: 'Get notified when an artist releases new music',
    group: 'fan_notifications',
    defaultEnabled: true,
  },
  dsp_match_suggested: {
    name: 'DSP Profile Suggestions',
    description: 'We found your profile on another music platform',
    group: 'profile_suggestions',
    defaultEnabled: true,
  },
  social_link_suggested: {
    name: 'Social Profile Suggestions',
    description: 'We found a social media profile that might be yours',
    group: 'profile_suggestions',
    defaultEnabled: true,
  },
  enrichment_complete: {
    name: 'Profile Enrichment Updates',
    description:
      'Your profile has been updated with new data from music platforms',
    group: 'profile_updates',
    defaultEnabled: false,
  },
  new_release_detected: {
    name: 'New Release Sync',
    description: 'We detected and synced a new release to your profile',
    group: 'profile_updates',
    defaultEnabled: true,
  },
} as const;

/**
 * Notification group metadata
 */
export const NOTIFICATION_GROUPS: Record<
  NotificationGroup,
  { name: string; description: string }
> = {
  fan_notifications: {
    name: 'Fan Notifications',
    description: 'Notifications about artists you follow',
  },
  profile_suggestions: {
    name: 'Profile Suggestions',
    description: 'Suggestions to improve your artist profile',
  },
  profile_updates: {
    name: 'Profile Updates',
    description: 'Updates about your profile data',
  },
} as const;

// ============================================================================
// Social Link Discovery Types
// ============================================================================

/**
 * Known social platforms
 */
export type SocialPlatform =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'facebook'
  | 'youtube'
  | 'twitch'
  | 'discord'
  | 'bandcamp'
  | 'website';

/**
 * Extracted social link from MusicBrainz or DSP
 */
export interface ExtractedSocialLink {
  platform: SocialPlatform;
  url: string;
  username?: string;
  source: DspProviderId;
  sourceArtistId?: string;
}

/**
 * MusicBrainz URL relation type mappings
 */
export const MUSICBRAINZ_URL_TYPE_MAP: Record<string, SocialPlatform> = {
  'official homepage': 'website',
  'social network': 'instagram', // Needs URL parsing for specific platform
  youtube: 'youtube',
  'video channel': 'youtube',
  twitter: 'twitter',
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  twitch: 'twitch',
  discord: 'discord',
  bandcamp: 'bandcamp',
} as const;

// ============================================================================
// Batch Processing Constants
// ============================================================================

/**
 * Batch processing configuration
 */
export const DSP_BATCH_CONFIG = {
  /** Max profiles per cron run */
  PROFILES_PER_CRON: 500,
  /** Apple Music API batch limit for ISRC lookups */
  ISRC_BATCH_SIZE: 25,
  /** Tracks per enrichment batch */
  TRACKS_PER_ENRICHMENT_BATCH: 25,
  /** Min delay between staggered jobs (ms) */
  MIN_DELAY_BETWEEN_JOBS_MS: 30_000,
  /** Max delay between staggered jobs (ms) */
  MAX_DELAY_BETWEEN_JOBS_MS: 120_000,
  /** Max concurrent jobs per host */
  MAX_CONCURRENT_JOBS_PER_HOST: 2,
  /** Job timeout (ms) */
  JOB_TIMEOUT_MS: 300_000,
} as const;

/**
 * Rate limiter configurations per provider
 */
export const DSP_RATE_LIMITS = {
  apple_music: { requests: 80, window: 60 }, // 80/min
  apple_music_bulk_isrc: { requests: 20, window: 60 }, // 20 bulk lookups/min
  deezer: { requests: 40, window: 60 }, // 40/min
  musicbrainz: { requests: 1, window: 1 }, // 1/sec (be respectful)
  dsp_discovery: { requests: 10, window: 60 }, // 10 discoveries/min per user
  dsp_enrichment: { requests: 100, window: 3600 }, // 100 enrichments/hour global
  musicfetch: { requests: 6, window: 60 }, // 6/min (starter tier, adjust per plan)
} as const;

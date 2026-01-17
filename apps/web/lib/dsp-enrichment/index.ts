/**
 * DSP Enrichment System
 *
 * Cross-platform artist matching, profile enrichment,
 * and new release detection.
 *
 * NOTE: This barrel file exports ONLY types and client-safe code.
 * For server-only functionality (providers, matching, circuit breakers),
 * import from './index.server' instead.
 *
 * @example
 * // Client code (types only)
 * import type { DspProviderId, DspMatchStatus } from '@/lib/dsp-enrichment';
 *
 * // Server code (full functionality)
 * import { lookupAppleMusicByIsrc } from '@/lib/dsp-enrichment/index.server';
 */

// Types only - safe for client bundles
export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';

export type {
  LocalArtistData,
  LocalTrackData,
  MatchingResult,
} from './matching';

// Types only (explicit exports - no runtime constants)
export type {
  // Provider API response types
  AppleMusicAlbum,
  AppleMusicArtist,
  AppleMusicTrack,
  // Matching algorithm types
  ArtistMatchCandidate,
  AutoConfirmThresholds,
  ConfidenceWeights,
  DeezerArtist,
  DeezerTrack,
  // Discovery job types
  DiscographySyncPayload,
  DiscographySyncResult,
  DspArtistDiscoveryPayload,
  DspArtistDiscoveryResult,
  // Re-exported from DB schema
  DspArtistEnrichment,
  DspArtistMatch,
  DspExternalUrls,
  DspImageUrls,
  DspMatchConfidenceBreakdown,
  // Provider type aliases
  DspMatchStatus,
  DspProviderId,
  DspTrackEnrichmentPayload,
  DspTrackEnrichmentResult,
  // Social link types
  ExtractedSocialLink,
  FanNotificationPreferences,
  FanReleaseNotification,
  IsrcMatchResult,
  MusicBrainzArtist,
  MusicBrainzRecording,
  MusicBrainzRelation,
  NewDspArtistEnrichment,
  NewDspArtistMatch,
  NewFanReleaseNotification,
  NewReleaseSyncStatus,
  NewSocialLinkSuggestion,
  // Notification types
  NotificationCategory,
  NotificationGroup,
  NotificationPreferences,
  ReleaseNotificationStatus,
  ReleaseNotificationType,
  ReleaseSyncStatus,
  ScoredArtistMatch,
  SocialLinkSuggestion,
  SocialPlatform,
  SocialSuggestionConfidenceBreakdown,
  SocialSuggestionStatus,
} from './types';

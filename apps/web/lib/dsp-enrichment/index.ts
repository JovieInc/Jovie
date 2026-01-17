/**
 * DSP Enrichment System
 *
 * Cross-platform artist matching, profile enrichment,
 * and new release detection.
 */

export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';

// Circuit breakers (server-only)
export {
  appleMusicCircuitBreaker,
  deezerCircuitBreaker,
  getAllCircuitBreakerStats,
  getCircuitBreakerForProvider,
  musicBrainzCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuit-breakers';
export type {
  LocalArtistData,
  LocalTrackData,
  MatchingResult,
} from './matching';

// Matching algorithm (server-only)
export {
  // ISRC aggregation
  aggregateIsrcMatches,
  // Name similarity
  areArtistNamesSimilar,
  artistNameSimilarity,
  // Confidence scoring
  calculateConfidenceScore,
  calculateFollowerRatioScore,
  calculateGenreOverlapScore,
  calculateIsrcMatchScore,
  calculateNameSimilarityScore,
  calculateUpcMatchScore,
  // Orchestration
  convertAppleMusicToIsrcMatches,
  enrichCandidatesWithProfiles,
  filterByMinMatches,
  getBestCandidate,
  jaroWinklerSimilarity,
  mergeUpcMatches,
  normalizeArtistName,
  orchestrateMatching,
  refineConfidenceScore,
  scoreAndRankCandidates,
  selectTracksForMatching,
  validateMatch,
} from './matching';
// Providers (server-only)
export {
  // Apple Music Provider
  APPLE_MUSIC_DEFAULT_STOREFRONT,
  APPLE_MUSIC_MAX_ISRC_BATCH_SIZE,
  AppleMusicError,
  AppleMusicNotConfiguredError,
  bulkLookupAppleMusicByIsrc,
  clearAppleMusicTokenCache,
  extractAppleMusicBio,
  extractAppleMusicExternalUrls,
  extractAppleMusicImageUrls,
  getAppleMusicArtist,
  getAppleMusicArtistAlbums,
  getAppleMusicAuthHeaders,
  getAppleMusicStats,
  getAppleMusicToken,
  isAppleMusicAvailable,
  isAppleMusicConfigured,
  lookupAppleMusicByIsrc,
  lookupAppleMusicByUpc,
  searchAppleMusicArtist,
} from './providers';

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

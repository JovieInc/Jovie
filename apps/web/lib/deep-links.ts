/**
 * Deep Link Utility for Social Networks and Music Streaming Platforms
 *
 * @deprecated Import from '@/lib/deep-links' instead (the directory module).
 * This file re-exports for backwards compatibility.
 *
 * @example
 * ```typescript
 * // New way (preferred)
 * import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
 *
 * // Old way (still works)
 * import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links.ts';
 * ```
 */

// Re-export everything from the new module structure
export {
  // Utils
  createDeepLink,
  // Types
  type DeepLinkConfig,
  type DeepLinkResult,
  DSP_DEEP_LINKS,
  detectPlatform,
  extractAppleMusicArtistId,
  extractFacebookUsername,
  // Extractors
  extractInstagramUsername,
  extractSpotifyArtistId,
  extractTikTokUsername,
  extractTwitterUsername,
  extractYouTubeChannelId,
  extractYouTubeMusicChannelId,
  extractYouTubeUsername,
  getDSPDeepLinkConfig,
  // Config getters
  getSocialDeepLinkConfig,
  type OpenDeepLinkOptions,
  openDeepLink,
  type PlatformInfo,
  // Configs
  SOCIAL_DEEP_LINKS,
} from './deep-links/index';

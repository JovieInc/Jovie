/**
 * Deep Link Utility for Social Networks and Music Streaming Platforms
 *
 * Provides native app deep linking with graceful fallbacks to web versions.
 * Supports iOS and Android URL schemes plus universal links.
 *
 * @example
 * ```typescript
 * import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
 *
 * const config = getSocialDeepLinkConfig('instagram');
 * if (config) {
 *   await openDeepLink('https://instagram.com/username', config);
 * }
 * ```
 */

export { DSP_DEEP_LINKS } from './configs/music';

// Configs
export { SOCIAL_DEEP_LINKS } from './configs/social';
// Extractors (for reuse in other modules)
export {
  extractAppleMusicArtistId,
  extractFacebookUsername,
  extractInstagramUsername,
  extractSpotifyArtistId,
  extractTikTokUsername,
  extractTwitterUsername,
  extractYouTubeChannelId,
  extractYouTubeMusicChannelId,
  extractYouTubeUsername,
} from './extractors';
// Types
export type {
  DeepLinkConfig,
  DeepLinkResult,
  OpenDeepLinkOptions,
  PlatformInfo,
} from './types';
// Utils
export { createDeepLink, detectPlatform, openDeepLink } from './utils';

import { DSP_DEEP_LINKS } from './configs/music';
// Config getters
import { SOCIAL_DEEP_LINKS } from './configs/social';
import type { DeepLinkConfig } from './types';

/**
 * Gets the appropriate deep link configuration for a social platform
 */
export function getSocialDeepLinkConfig(
  platform: string
): DeepLinkConfig | null {
  const normalizedPlatform = platform.toLowerCase();
  return SOCIAL_DEEP_LINKS[normalizedPlatform] || null;
}

/**
 * Gets the appropriate deep link configuration for a DSP platform
 */
export function getDSPDeepLinkConfig(platform: string): DeepLinkConfig | null {
  const normalizedPlatform = platform.toLowerCase();
  return DSP_DEEP_LINKS[normalizedPlatform] || null;
}

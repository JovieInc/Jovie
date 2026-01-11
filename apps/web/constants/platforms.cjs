/**
 * CommonJS export of social platform identifiers for ESLint rules.
 *
 * This file provides the same platform list as platforms.ts in a format
 * that can be used by CommonJS modules (like ESLint rules).
 *
 * IMPORTANT: This list should be kept in sync with ALL_PLATFORMS in platforms.ts.
 * When adding a new platform to platforms.ts, also add its id here.
 *
 * @see platforms.ts for the canonical source with full metadata
 */

/**
 * Array of all valid social platform identifiers.
 * Matches the SOCIAL_PLATFORMS export from platforms.ts.
 */
const SOCIAL_PLATFORMS = [
  // Music Platforms (DSPs)
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'bandcamp',
  'tidal',
  'deezer',
  'amazon_music',
  'pandora',
  'beatport',

  // Social Media Platforms
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'snapchat',
  'pinterest',
  'reddit',

  // Creator/Content Platforms
  'twitch',
  'discord',
  'patreon',
  'onlyfans',
  'substack',
  'medium',
  'github',
  'behance',
  'dribbble',

  // Link Aggregators
  'linktree',
  'beacons',
  'linkin_bio',
  'allmylinks',
  'linkfire',
  'toneden',

  // Payment/Tip Platforms
  'venmo',
  'paypal',
  'cashapp',
  'zelle',
  'ko_fi',
  'buymeacoffee',
  'gofundme',

  // Messaging/Communication Platforms
  'whatsapp',
  'telegram',
  'signal',
  'email',
  'phone',

  // Professional Links
  'website',
  'blog',
  'portfolio',
  'booking',
  'press_kit',

  // Other
  'other',
];

module.exports = {
  SOCIAL_PLATFORMS,
};

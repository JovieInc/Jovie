/**
 * Platforms that support full profile extraction (avatar, name, links).
 * These platforms have dedicated extraction strategies.
 */
export const FULL_EXTRACTION_PLATFORMS = ['linktree', 'laylo'] as const;

/**
 * All social platforms supported for creator import.
 * Any URL from these platforms can be used to create a creator profile.
 */
export const SUPPORTED_INGEST_PLATFORMS = [
  // Link aggregators (full extraction)
  'linktree',
  'laylo',
  'beacons',
  // Social media
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
  'threads',
  // Creator platforms
  'twitch',
  'discord',
  'patreon',
  'onlyfans',
  'substack',
  'medium',
  'github',
  'behance',
  'dribbble',
  // Music platforms
  'spotify',
  'soundcloud',
  'bandcamp',
  'apple_music',
  'youtube_music',
  // Payment platforms
  'venmo',
  'paypal',
  'cashapp',
  'ko_fi',
  'buymeacoffee',
  // Messaging
  'telegram',
  'whatsapp',
  // Other
  'website',
] as const;

export type SupportedIngestPlatform =
  (typeof SUPPORTED_INGEST_PLATFORMS)[number];

/**
 * Check if a platform supports full profile extraction
 */
export function supportsFullExtraction(platformId: string): boolean {
  return (FULL_EXTRACTION_PLATFORMS as readonly string[]).includes(platformId);
}

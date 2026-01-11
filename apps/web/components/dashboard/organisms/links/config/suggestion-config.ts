/**
 * Suggestion Configuration
 *
 * Configuration constants for quick-add suggestion pills.
 * These define the available platforms that can be suggested to users
 * and the ordering based on profile type (music vs social).
 */

/**
 * Configuration for a single suggestion pill
 *
 * Defines the platform identification and display information
 * for a quick-add suggestion button.
 */
export interface SuggestionPillConfig {
  /** Platform ID used by platform-detection (e.g., 'spotify-artist', 'instagram') */
  id: string;
  /** Display label shown on the pill */
  label: string;
  /** Simple Icons key for SocialIcon/getPlatformIcon */
  simpleIconId: string;
}

/**
 * Available suggestion pills
 *
 * The complete list of platforms that can be suggested as quick-add options.
 * Each pill represents a popular platform that users commonly add to their profiles.
 *
 * Note: This list is filtered at runtime to exclude platforms the user has already added.
 */
export const SUGGESTION_PILLS: SuggestionPillConfig[] = [
  { id: 'spotify-artist', label: 'Spotify Artist', simpleIconId: 'spotify' },
  { id: 'apple-music', label: 'Apple Music', simpleIconId: 'applemusic' },
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    simpleIconId: 'youtube',
  },
  { id: 'instagram', label: 'Instagram', simpleIconId: 'instagram' },
  { id: 'tiktok', label: 'TikTok', simpleIconId: 'tiktok' },
  { id: 'youtube', label: 'YouTube', simpleIconId: 'youtube' },
  { id: 'twitter', label: 'X / Twitter', simpleIconId: 'x' },
  { id: 'venmo', label: 'Venmo', simpleIconId: 'venmo' },
  { id: 'website', label: 'Website', simpleIconId: 'website' },
];

/**
 * Suggestion ordering for music-focused profiles
 *
 * Prioritizes streaming platforms (Spotify, Apple Music, YouTube Music)
 * over social platforms for artists and music creators.
 */
export const MUSIC_FIRST_ORDER = [
  'spotify-artist',
  'apple-music',
  'youtube',
  'youtube-music',
  'instagram',
  'tiktok',
  'twitter',
  'venmo',
  'website',
] as const;

/**
 * Suggestion ordering for social-focused profiles
 *
 * Prioritizes social media platforms (Instagram, TikTok, YouTube)
 * over streaming platforms for influencers and content creators.
 */
export const SOCIAL_FIRST_ORDER = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'apple-music',
  'youtube-music',
  'venmo',
  'website',
] as const;

/**
 * Type for music-first order platform IDs
 */
export type MusicFirstOrderPlatform = (typeof MUSIC_FIRST_ORDER)[number];

/**
 * Type for social-first order platform IDs
 */
export type SocialFirstOrderPlatform = (typeof SOCIAL_FIRST_ORDER)[number];

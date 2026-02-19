/**
 * Video Provider Configuration
 *
 * Config and constants for short-form video providers used by the
 * "Use this sound" feature. These platforms (TikTok, Instagram Reels,
 * YouTube Shorts) allow creators to use a song's audio in their content.
 *
 * Provider links for these are populated by musicfetch and stored in the
 * `provider_links` table with the corresponding provider IDs.
 */

import type { VideoProviderKey } from './types';

export interface VideoProviderConfig {
  /** Display name for the provider */
  label: string;
  /** Brand accent color (hex) */
  accent: string;
  /** Call-to-action text for the button */
  cta: string;
  /** Icon identifier from the platforms registry */
  platformIcon: string;
}

export const VIDEO_PROVIDER_CONFIG: Record<
  VideoProviderKey,
  VideoProviderConfig
> = {
  tiktok_sound: {
    label: 'TikTok',
    accent: '#000000',
    cta: 'Use sound on TikTok',
    platformIcon: 'tiktok',
  },
  instagram_reels: {
    label: 'Instagram Reels',
    accent: '#E4405F',
    cta: 'Use audio on Instagram',
    platformIcon: 'instagram',
  },
  youtube_shorts: {
    label: 'YouTube Shorts',
    accent: '#FF0000',
    cta: 'Use sound on YouTube',
    platformIcon: 'youtube',
  },
};

/** Ordered list of video provider keys (by priority) */
export const VIDEO_PROVIDER_KEYS: VideoProviderKey[] = [
  'tiktok_sound',
  'instagram_reels',
  'youtube_shorts',
];

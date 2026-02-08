/**
 * Spotify Canvas and social media video specifications.
 *
 * These are the official requirements for Spotify Canvas videos
 * and common social media ad formats.
 */

import type { CanvasVideoSpec, SocialAdPlatform } from './types';

/**
 * Official Spotify Canvas video specifications.
 *
 * @see https://artists.spotify.com/help/article/canvas
 */
export const SPOTIFY_CANVAS_SPEC: CanvasVideoSpec = {
  minWidth: 720,
  minHeight: 720,
  aspectRatio: '9:16',
  minDurationSec: 3,
  maxDurationSec: 8,
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
  codecs: ['h264'],
  formats: ['mp4'],
  fps: 30,
} as const;

/**
 * Recommended canvas generation dimensions.
 * Uses portrait 9:16 ratio at 1080p for best quality.
 */
export const CANVAS_GENERATION_DIMENSIONS = {
  width: 1080,
  height: 1920,
} as const;

/**
 * Default canvas generation duration (in the sweet spot for loops).
 */
export const CANVAS_DEFAULT_DURATION_SEC = 5;

/**
 * Social media ad video specifications by platform.
 */
export const SOCIAL_AD_SPECS: Record<
  SocialAdPlatform,
  {
    readonly width: number;
    readonly height: number;
    readonly aspectRatio: string;
    readonly maxDurationSec: number;
    readonly recommendedDurationSec: number;
  }
> = {
  tiktok: {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    maxDurationSec: 60,
    recommendedDurationSec: 15,
  },
  instagram_reels: {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    maxDurationSec: 90,
    recommendedDurationSec: 30,
  },
  instagram_story: {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    maxDurationSec: 15,
    recommendedDurationSec: 15,
  },
  youtube_shorts: {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    maxDurationSec: 60,
    recommendedDurationSec: 30,
  },
  hulu: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    maxDurationSec: 30,
    recommendedDurationSec: 15,
  },
  generic: {
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    maxDurationSec: 60,
    recommendedDurationSec: 30,
  },
} as const;

/**
 * TikTok preview clip specifications.
 */
export const TIKTOK_PREVIEW_SPEC = {
  /** Duration of TikTok sound previews */
  durationSec: 15,
  /** Ideal clip should start within the first N seconds of the song */
  maxStartOffsetSec: 120,
} as const;

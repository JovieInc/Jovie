/**
 * Social Links Service Types
 *
 * Centralized type definitions for social link operations.
 */

/**
 * Link state in the review workflow.
 */
export type LinkState = 'active' | 'suggested' | 'rejected';

/**
 * Source type for how the link was added.
 */
export type LinkSourceType = 'manual' | 'admin' | 'ingested';

/**
 * Social link data for dashboard display and editing.
 */
export interface DashboardSocialLink {
  id: string;
  platform: string;
  platformType: string | null;
  url: string;
  sortOrder: number | null;
  isActive: boolean | null;
  displayText: string | null;
  state: LinkState;
  confidence: number | null;
  sourcePlatform: string | null;
  sourceType: LinkSourceType | null;
  evidence: {
    sources?: string[];
    signals?: string[];
    linkType?: string | null;
  } | null;
  version?: number;
}

/**
 * Data for creating a new social link.
 */
export interface CreateLinkData {
  platform: string;
  platformType?: string;
  url: string;
  displayText?: string;
  sortOrder?: number;
  isActive?: boolean;
  state?: LinkState;
  sourceType?: LinkSourceType;
}

/**
 * Data for updating an existing social link.
 */
export interface UpdateLinkData {
  platform?: string;
  platformType?: string;
  url?: string;
  displayText?: string;
  sortOrder?: number;
  isActive?: boolean;
  state?: LinkState;
}

/**
 * List of Digital Streaming Platform (DSP) identifiers.
 * Includes 'youtube' since artists commonly use it for music content.
 */
export const DSP_PLATFORMS = [
  'amazon-music',
  'amazon_music',
  'apple-music',
  'apple_music',
  'bandcamp',
  'deezer',
  'netease',
  'pandora',
  'soundcloud',
  'spotify',
  'tencent-music',
  'tencent_music',
  'tidal',
  'youtube',
  'youtube-music',
  'youtube_music',
] as const;

export type DspPlatform = (typeof DSP_PLATFORMS)[number];

/**
 * Check if a platform is a DSP.
 */
export function isDspPlatform(platform: string): platform is DspPlatform {
  return DSP_PLATFORMS.includes(platform as DspPlatform);
}

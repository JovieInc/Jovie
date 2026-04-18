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
 * Check if a platform is a DSP.
 * Delegates to the canonical DSP registry which handles
 * kebab-case, snake_case, and alias normalization.
 */
export {
  isDspPlatform,
  STREAMING_DSP_KEYS as DSP_PLATFORMS,
} from '@/lib/dsp-registry';

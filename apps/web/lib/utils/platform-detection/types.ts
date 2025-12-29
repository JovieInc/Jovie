/**
 * Platform Detection Types
 * Type definitions for platform detection and link normalization
 */

/**
 * Detection-specific category types.
 * Maps from canonical categories to detection categories.
 */
export type DetectionCategory =
  | 'dsp'
  | 'social'
  | 'earnings'
  | 'websites'
  | 'custom';

export interface PlatformInfo {
  id: string;
  name: string;
  category: DetectionCategory; // DSP = Digital Service Provider (music platforms)
  icon: string; // Simple Icons platform key
  color: string; // Brand color hex
  placeholder: string;
}

export interface DetectedLink {
  platform: PlatformInfo;
  normalizedUrl: string;
  originalUrl: string;
  suggestedTitle: string;
  isValid: boolean;
  error?: string;
}

/**
 * Extended DetectedLink with optional visibility and metadata fields.
 * Used by link management components that track visibility state.
 */
export interface ManagedLink extends DetectedLink {
  /** Whether the link is visible on the profile. Defaults to true if not set. */
  isVisible?: boolean;
  /** Database ID when persisted */
  id?: string;
  /** Link state for admin/ingestion workflows */
  state?: 'active' | 'suggested' | 'rejected';
  /** Confidence score from detection/ingestion */
  confidence?: number | null;
  /** Source platform for ingested links */
  sourcePlatform?: string | null;
  /** How the link was created */
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  /** Evidence from ingestion */
  evidence?: { sources?: string[]; signals?: string[] } | null;
}

/**
 * Domain pattern configuration for platform detection
 */
export interface DomainPattern {
  pattern: RegExp;
  platformId: string;
}

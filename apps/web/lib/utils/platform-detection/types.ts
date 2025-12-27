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
 * Domain pattern configuration for platform detection
 */
export interface DomainPattern {
  pattern: RegExp;
  platformId: string;
}

/**
 * Intent Detection Types
 * Type definitions for deterministic intent classification and routing
 */

export enum IntentCategory {
  PROFILE_UPDATE_NAME = 'PROFILE_UPDATE_NAME',
  PROFILE_UPDATE_BIO = 'PROFILE_UPDATE_BIO',
  LINK_ADD = 'LINK_ADD',
  LINK_REMOVE = 'LINK_REMOVE',
  AVATAR_UPLOAD = 'AVATAR_UPLOAD',
  SETTINGS_TOGGLE = 'SETTINGS_TOGGLE',
  AI_REQUIRED = 'AI_REQUIRED',
}

export interface DetectedIntent {
  category: IntentCategory;
  confidence: number;
  /** Extracted payload from the regex match (e.g., new name, platform, URL) */
  extractedData: Record<string, string>;
  /** The original user message text */
  rawMessage: string;
}

export interface IntentPattern {
  category: IntentCategory;
  pattern: RegExp;
  /** Extract structured data from regex match groups */
  extract: (match: RegExpMatchArray, message: string) => Record<string, string>;
  /** Higher priority patterns are tested first (default: 0) */
  priority: number;
}

/**
 * Link Types
 *
 * Type definitions for link management in the dashboard.
 * These types are used across hooks, utilities, and components.
 */

/**
 * Platform type categories used for organizing links
 */
export type PlatformType =
  | 'social'
  | 'dsp'
  | 'earnings'
  | 'websites'
  | 'custom';

/**
 * Platform metadata interface
 */
export interface Platform {
  id: string;
  name: string;
  category: PlatformType;
  icon: string;
  color: string;
  placeholder: string;
}

/**
 * LinkItem represents a fully hydrated link in the dashboard
 */
export interface LinkItem {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
  order: number;
  category: PlatformType;
  normalizedUrl: string;
  originalUrl: string;
  suggestedTitle: string;
  isValid: boolean;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: { sources?: string[]; signals?: string[] } | null;
  verificationStatus?: 'unverified' | 'pending' | 'verified' | null;
  verificationToken?: string | null;
  version?: number;
}

/**
 * SuggestedLink is re-exported from useSuggestions hook
 * where it is defined to avoid duplicate definitions
 */
export type { SuggestedLink } from '../hooks/useSuggestions';

/**
 * Profile update payload for API calls
 */
export type ProfileUpdatePayload = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Profile update response from API
 */
export type ProfileUpdateResponse = {
  profile: {
    username?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  warning?: string;
};

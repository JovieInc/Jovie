/**
 * Profile Service Types
 *
 * Centralized type definitions for profile data access.
 * Types are inferred from Drizzle schema for consistency.
 */

import type {
  CreatorContact,
  CreatorProfile,
  creatorTypeEnum,
} from '@/lib/db/schema';

/** Creator type enum values */
export type CreatorType = (typeof creatorTypeEnum.enumValues)[number];

/**
 * Minimal profile data for list views and summaries.
 */
export type ProfileSummary = Pick<
  CreatorProfile,
  | 'id'
  | 'username'
  | 'usernameNormalized'
  | 'displayName'
  | 'avatarUrl'
  | 'isPublic'
  | 'isClaimed'
  | 'isVerified'
>;

/**
 * Full profile data for public rendering.
 * Uses Drizzle-inferred types for consistency.
 */
export type ProfileData = Pick<
  CreatorProfile,
  | 'id'
  | 'userId'
  | 'creatorType'
  | 'username'
  | 'usernameNormalized'
  | 'displayName'
  | 'bio'
  | 'avatarUrl'
  | 'spotifyUrl'
  | 'appleMusicUrl'
  | 'youtubeUrl'
  | 'spotifyId'
  | 'isPublic'
  | 'isVerified'
  | 'isClaimed'
  | 'isFeatured'
  | 'marketingOptOut'
  | 'settings'
  | 'theme'
  | 'profileViews'
  | 'genres'
  | 'spotifyPopularity'
  | 'createdAt'
  | 'updatedAt'
>;

/**
 * Profile data with user context (isPro, clerkId).
 */
export type ProfileWithUser = ProfileData & {
  userIsPro: boolean | null;
  userClerkId: string | null;
};

/**
 * Social link data for profile rendering.
 */
export interface ProfileSocialLink {
  id: string;
  creatorProfileId: string;
  platform: string;
  platformType: string;
  url: string;
  displayText: string | null;
  clicks: number | null;
  isActive: boolean | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Full profile with social links and contacts.
 */
export type ProfileWithLinks = ProfileWithUser & {
  socialLinks: ProfileSocialLink[];
  contacts: CreatorContact[];
};

/**
 * Options for profile queries.
 */
export interface ProfileQueryOptions {
  /** Include social links in the response */
  includeLinks?: boolean;
  /** Include contacts in the response */
  includeContacts?: boolean;
  /** Include user data (isPro, clerkId) */
  includeUser?: boolean;
}

/**
 * Options for profile updates.
 */
export interface ProfileUpdateData {
  username?: string;
  usernameNormalized?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeUrl?: string;
  creatorType?: CreatorType;
  isPublic?: boolean;
  marketingOptOut?: boolean;
  settings?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  onboardingCompletedAt?: Date | null;
}

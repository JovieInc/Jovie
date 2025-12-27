/**
 * Dashboard API Endpoint Types
 *
 * TypeScript interfaces for all dashboard API response and request shapes.
 * These types match the actual API route handlers in /api/dashboard/*.
 *
 * @see apps/web/app/api/dashboard/profile/route.ts
 * @see apps/web/app/api/dashboard/social-links/route.ts
 * @see apps/web/app/api/dashboard/analytics/route.ts
 * @see apps/web/app/api/dashboard/audience/members/route.ts
 * @see apps/web/app/api/dashboard/audience/subscribers/route.ts
 * @see apps/web/app/api/dashboard/activity/recent/route.ts
 */

export type {
  CreatorType,
  IngestionSourceType,
  SocialLinkState,
  SocialPlatform,
} from '@/types';
// Re-export commonly used types for convenience
export type {
  AnalyticsRange,
  DashboardAnalyticsView,
} from '@/types/analytics';

// =============================================================================
// Common Types
// =============================================================================

/**
 * Theme preference for the creator's profile
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Theme settings stored in the database
 */
export interface ThemeSettings {
  preference?: ThemePreference;
  mode?: ThemePreference;
}

/**
 * Profile settings stored in the database
 */
export interface ProfileSettings {
  hide_branding?: boolean;
  marketing_emails?: boolean;
}

// =============================================================================
// Profile Types
// =============================================================================

/**
 * Creator profile as returned by the dashboard profile API.
 * Uses camelCase to match the Drizzle schema output.
 */
export interface DashboardProfile {
  id: string;
  userId: string | null;
  username: string;
  usernameNormalized: string;
  displayName: string | null;
  displayTitle: string;
  bio: string | null;
  avatarUrl: string | null;
  creatorType: 'artist' | 'podcaster' | 'influencer' | 'creator';
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  spotifyId: string | null;
  venmoHandle: string | null;
  isPublic: boolean;
  isVerified: boolean;
  isFeatured: boolean;
  isClaimed: boolean;
  marketingOptOut: boolean;
  profileViews: number;
  profileCompletionPct: number;
  avatarLockedByUser: boolean | null;
  displayNameLocked: boolean | null;
  ingestionStatus: 'idle' | 'pending' | 'processing' | 'failed' | null;
  settings: ProfileSettings | null;
  theme: ThemeSettings | null;
  claimToken: string | null;
  claimedAt: string | null;
  onboardingCompletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /api/dashboard/profile response
 */
export interface GetProfileResponse {
  profile: DashboardProfile;
}

/**
 * Profile update payload for PUT /api/dashboard/profile
 */
export interface ProfileUpdatePayload {
  username?: string;
  displayName?: string;
  bio?: string;
  creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
  avatarUrl?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeUrl?: string;
  isPublic?: boolean;
  marketingOptOut?: boolean;
  settings?: ProfileSettings;
  theme?: ThemeSettings;
  venmo_handle?: string;
}

/**
 * PUT /api/dashboard/profile request body
 */
export interface UpdateProfileRequest {
  updates: ProfileUpdatePayload;
}

/**
 * PUT /api/dashboard/profile response
 */
export interface UpdateProfileResponse {
  profile: DashboardProfile;
  /** Warning message if avatar sync with Clerk failed */
  warning?: string;
}

// =============================================================================
// Social Links Types
// =============================================================================

/**
 * Evidence metadata for link provenance
 */
export interface LinkEvidence {
  sources?: string[];
  signals?: string[];
}

/**
 * Social link as returned by the dashboard social-links API
 */
export interface DashboardSocialLink {
  id: string;
  platform: string;
  platformType: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
  displayText: string | null;
  state: 'active' | 'suggested' | 'rejected';
  confidence: number;
  sourcePlatform: string | null;
  sourceType: 'manual' | 'admin' | 'ingested';
  evidence: LinkEvidence | null;
  version: number;
}

/**
 * GET /api/dashboard/social-links request query params
 */
export interface GetSocialLinksParams {
  profileId: string;
}

/**
 * GET /api/dashboard/social-links response
 */
export interface GetSocialLinksResponse {
  links: DashboardSocialLink[];
}

/**
 * Link input for creating/updating social links
 */
export interface SocialLinkInput {
  platform: string;
  platformType?: string;
  url: string;
  sortOrder?: number;
  isActive?: boolean;
  displayText?: string;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number;
  sourcePlatform?: string;
  sourceType?: 'manual' | 'admin' | 'ingested';
  evidence?: LinkEvidence;
}

/**
 * PUT /api/dashboard/social-links request body
 */
export interface UpdateSocialLinksRequest {
  profileId: string;
  links?: SocialLinkInput[];
  idempotencyKey?: string;
  expectedVersion?: number;
}

/**
 * PUT /api/dashboard/social-links success response
 */
export interface UpdateSocialLinksResponse {
  ok: true;
  version: number;
}

/**
 * PATCH /api/dashboard/social-links request body (accept/dismiss suggestion)
 */
export interface UpdateLinkStateRequest {
  profileId: string;
  linkId: string;
  action: 'accept' | 'dismiss';
  expectedVersion?: number;
}

/**
 * PATCH /api/dashboard/social-links success response
 */
export interface UpdateLinkStateResponse {
  ok: true;
  link: DashboardSocialLink;
}

/**
 * Version conflict error response for social links operations
 */
export interface SocialLinksVersionConflictResponse {
  error: string;
  code: 'VERSION_CONFLICT';
  currentVersion: number;
  expectedVersion: number;
}

// =============================================================================
// Analytics Types
// =============================================================================

/**
 * City breakdown for analytics
 */
export interface AnalyticsCityRow {
  city: string;
  count: number;
}

/**
 * Country breakdown for analytics
 */
export interface AnalyticsCountryRow {
  country: string;
  count: number;
}

/**
 * Referrer breakdown for analytics
 */
export interface AnalyticsReferrerRow {
  referrer: string;
  count: number;
}

/**
 * GET /api/dashboard/analytics request query params
 */
export interface GetAnalyticsParams {
  range?: '1d' | '7d' | '30d' | '90d' | 'all';
  view?: 'traffic' | 'full';
  refresh?: '1';
}

/**
 * GET /api/dashboard/analytics response
 *
 * Fields vary based on the `view` parameter:
 * - 'traffic': Returns only profile_views and geo data
 * - 'full': Returns all analytics including clicks, subscribers, etc.
 */
export interface GetAnalyticsResponse {
  /** Total profile views in the time range */
  profile_views: number;
  /** Unique visitors (optional, included in 'full' view) */
  unique_users?: number;
  /** Total link clicks (optional, included in 'full' view) */
  listen_clicks?: number;
  /** Total subscribers (optional, included in 'full' view) */
  subscribers?: number;
  /** Identified/logged-in users (optional, included in 'full' view) */
  identified_users?: number;
  /** Total clicks across all links (optional, included in 'full' view) */
  total_clicks?: number;
  /** Spotify-specific clicks (optional, included in 'full' view) */
  spotify_clicks?: number;
  /** Social link clicks (optional, included in 'full' view) */
  social_clicks?: number;
  /** Recent clicks count (optional, included in 'full' view) */
  recent_clicks?: number;
  /** Top cities by visitor count */
  top_cities: AnalyticsCityRow[];
  /** Top countries by visitor count */
  top_countries: AnalyticsCountryRow[];
  /** Top referrers by visitor count */
  top_referrers: AnalyticsReferrerRow[];
  /** The view type used for this response */
  view?: 'traffic' | 'full';
}

// =============================================================================
// Audience Types
// =============================================================================

/**
 * Audience member type classification
 */
export type AudienceMemberType =
  | 'anonymous'
  | 'email'
  | 'sms'
  | 'spotify'
  | 'customer';

/**
 * Intent level classification for audience members
 */
export type AudienceIntentLevel = 'low' | 'medium' | 'high' | 'superfan';

/**
 * Device type classification
 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

/**
 * Audience member as returned by the audience/members API
 */
export interface AudienceMember {
  id: string;
  type: AudienceMemberType;
  displayName: string | null;
  visits: number;
  engagementScore: number | null;
  intentLevel: AudienceIntentLevel | null;
  geoCity: string | null;
  geoCountry: string | null;
  deviceType: DeviceType | null;
  latestActions: string[];
  referrerHistory: string[];
  email: string | null;
  phone: string | null;
  spotifyConnected: boolean;
  purchaseCount: number | null;
  tags: string[];
  lastSeenAt: string | null;
  createdAt: string | null;
}

/**
 * Sort options for audience members
 */
export type AudienceMemberSort =
  | 'lastSeen'
  | 'visits'
  | 'intent'
  | 'type'
  | 'engagement'
  | 'createdAt';

/**
 * GET /api/dashboard/audience/members request query params
 */
export interface GetAudienceMembersParams {
  profileId: string;
  sort?: AudienceMemberSort;
  direction?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * GET /api/dashboard/audience/members response
 */
export interface GetAudienceMembersResponse {
  members: AudienceMember[];
  total: number;
}

/**
 * Notification subscription channel type
 */
export type SubscriptionChannel = 'email' | 'sms';

/**
 * Subscriber as returned by the audience/subscribers API
 */
export interface Subscriber {
  id: string;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  createdAt: Date;
  channel: SubscriptionChannel | null;
}

/**
 * Sort options for subscribers
 */
export type SubscriberSort = 'email' | 'phone' | 'country' | 'createdAt';

/**
 * GET /api/dashboard/audience/subscribers request query params
 */
export interface GetSubscribersParams {
  profileId: string;
  sort?: SubscriberSort;
  direction?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * GET /api/dashboard/audience/subscribers response
 */
export interface GetSubscribersResponse {
  subscribers: Subscriber[];
  total: number;
}

// =============================================================================
// Activity Types
// =============================================================================

/**
 * Recent activity item as returned by the activity/recent API
 */
export interface ActivityItem {
  id: string;
  /** Human-readable description of the activity */
  description: string;
  /** Emoji icon representing the activity type */
  icon: string;
  /** ISO timestamp of when the activity occurred */
  timestamp: string;
}

/**
 * Activity range for filtering
 */
export type ActivityRange = '7d' | '30d' | '90d';

/**
 * GET /api/dashboard/activity/recent request query params
 */
export interface GetRecentActivityParams {
  profileId: string;
  limit?: number;
  range?: ActivityRange;
}

/**
 * GET /api/dashboard/activity/recent response
 */
export interface GetRecentActivityResponse {
  activities: ActivityItem[];
}

// =============================================================================
// Theme Types
// =============================================================================

/**
 * PUT /api/dashboard/profile request body for theme updates
 * (subset of UpdateProfileRequest)
 */
export interface UpdateThemeRequest {
  updates: {
    theme: ThemeSettings;
  };
}

/**
 * Theme update response is same as UpdateProfileResponse
 */
export type UpdateThemeResponse = UpdateProfileResponse;
